'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { root, config, execute, rgbdsVersion, inspectRGBDS, checkNode, pythonSupported, inspectPython, verifyEmulator, checkLockedDependency, doctor } = require('./environment');

function checkArchive(file) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== config.rgbds.sha256) throw new Error(`RGBDS archive checksum mismatch: expected ${config.rgbds.sha256}, found ${hash}.`);
}
function response(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8 || new URL(url).protocol !== 'https:') return reject(new Error('Invalid RGBDS download redirect.'));
    const request = https.get(url, { headers: { 'User-Agent': 'Pyson-Setup' } }, result => {
      if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.headers.location) {
        result.resume(); resolve(response(new URL(result.headers.location, url).href, redirects + 1));
      } else if (result.statusCode !== 200) {
        result.resume(); reject(new Error(`RGBDS download returned HTTP ${result.statusCode}.`));
      } else resolve(result);
    });
    request.setTimeout(30000, () => request.destroy(new Error('RGBDS download timed out.')));
    request.on('error', reject);
  });
}
function run(command, args, options) {
  const result = execute(command, args, { stdio: 'inherit', timeout: 300000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || `exit ${result.status}`}`);
}
function findFiles(directory, basename) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected link in RGBDS archive.');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(file, basename));
    else if (entry.name === basename) files.push(file);
  }
  return files;
}
function removeStaging(directory) {
  const tools = path.resolve(root, 'tools');
  const relative = path.relative(tools, path.resolve(directory));
  if (!relative.startsWith('.setup-rgbds-') || relative.includes(path.sep) || path.isAbsolute(relative)) throw new Error('Invalid setup cleanup directory.');
  fs.rmSync(directory, { recursive: true, force: true });
}
async function installRGBDS(archive) {
  const destination = path.join(root, 'tools/rgbds');
  console.log(`Checking RGBDS installations (project version: ${config.rgbds.version})...`);
  const local = config.rgbds.requiredTools.map(name => {
    const result = inspectRGBDS(path.join(destination, name + '.exe'));
    console.log(describeRGBDS(name, result, true));
    return result;
  });
  for (const name of config.rgbds.requiredTools) console.log(describeRGBDS(name, inspectRGBDS(name + '.exe'), false));
  console.log('[INFO] Setup only installs or repairs tools/rgbds; system installations and PATH are left unchanged.');
  const installed = local.every(result => result.status === 'compatible');
  if (installed && !archive) { console.log(`RGBDS ${config.rgbds.version} is already installed locally.`); return; }
  const extraction = execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    'if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) { Write-Output ($PSVersionTable.PSVersion.ToString()) } else { Write-Error "Expand-Archive is unavailable"; exit 1 }']);
  if (extraction.error || extraction.status !== 0) throw new Error('[MISSING/INCOMPATIBLE] Windows PowerShell with Expand-Archive is required to extract RGBDS. Restore the built-in Windows PowerShell installation, then rerun setup.');
  console.log(`[OK] Windows PowerShell ${extraction.stdout.trim()}: archive extraction available.`);
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, 'tools/.setup-rgbds-'));
  try {
    const zip = archive ? path.resolve(archive) : path.join(staging, config.rgbds.archive);
    if (!archive) {
      console.log(`Downloading RGBDS ${config.rgbds.version} from the official release...`);
      await pipeline(await response(config.rgbds.url), fs.createWriteStream(zip, { flags: 'wx' }));
    }
    checkArchive(zip);
    const extracted = path.join(staging, 'extracted');
    run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $env:PYSON_SETUP_ARCHIVE -DestinationPath $env:PYSON_SETUP_EXTRACT -Force'],
    { env: { ...process.env, PYSON_SETUP_ARCHIVE: zip, PYSON_SETUP_EXTRACT: extracted } });
    const executables = config.rgbds.tools.map(name => {
      const matches = findFiles(extracted, name + '.exe');
      if (matches.length !== 1 || rgbdsVersion(matches[0]) !== config.rgbds.version) throw new Error(`Invalid ${name} in RGBDS archive.`);
      return matches[0];
    });
    fs.mkdirSync(destination, { recursive: true });
    for (const executable of executables) fs.copyFileSync(executable, path.join(destination, path.basename(executable)));
    console.log(`Installed RGBDS ${config.rgbds.version} in tools/rgbds.`);
  } finally { removeStaging(staging); }
}
function describeRGBDS(name, result, local) {
  const location = local ? 'project-local' : 'PATH';
  const prefix = local ? result.status === 'compatible' ? 'OK' : result.status.toUpperCase() : 'INFO';
  const source = `${location} ${name} (${result.executable})`;
  if (result.status === 'compatible') return `[${prefix}] ${source}: ${result.version}, compatible.`;
  if (result.status === 'missing') return `[${prefix}] ${source}: not installed.${local ? ' Setup will install it.' : ' No system-wide installation is needed.'}`;
  if (result.status === 'incompatible') return `[${prefix}] ${source}: installed ${result.version}; project requires ${result.expected}.${local ? ' Setup will replace this local executable.' : ' This version will not be used after local setup.'}`;
  return `[${prefix}] ${source}: installed but could not run or identify its version: ${result.detail}.${local ? ' Setup will repair this local executable.' : ' The local tools will be used instead.'}`;
}
function choosePython(inspect = inspectPython, environment = process.env, log = console.log) {
  const candidates = [];
  const requestedPython = environment.PYSON_SETUP_PYTHON || environment.GBPY_SETUP_PYTHON;
  if (requestedPython) candidates.push([requestedPython, []]);
  else {
    // Also identify a default unsupported installation before trying supported versions.
    candidates.push(['py.exe', []]);
    for (const minor of [13, 12, 11, 10]) candidates.push(['py.exe', [`-3.${minor}`]]);
    candidates.push(['python.exe', []]);
  }
  for (const [command, args] of candidates) {
    const info = inspect(command, args);
    if (!info) { log(`[MISSING/UNUSABLE] Python (${[command, ...args].join(' ')}): could not run this candidate.`); continue; }
    if (info.bits === 64 && pythonSupported(info.version)) {
      log(`[OK] Python ${info.version.join('.')} (${info.bits}-bit): ${info.executable}`);
      return info.executable;
    }
    log(`[INCOMPATIBLE] Python ${info.version.join('.')} (${info.bits}-bit): ${info.executable}. Optional emulator tools need 64-bit Python 3.10-3.13; this installation will not be changed.`);
  }
  throw new Error('Install 64-bit Python 3.10–3.13 with the Python launcher, or set PYSON_SETUP_PYTHON to its executable.');
}
function installEmulator() {
  const environment = path.join(root, 'tools/emulator-env');
  const python = path.join(environment, 'Scripts/python.exe');
  if (fs.existsSync(python)) {
    try {
      const info = verifyEmulator(python);
      console.log(`[OK] Optional emulator environment already compatible: Python ${info.version.join('.')}, PyBoy ${info.packages.pyboy}. No package download needed.`);
      return;
    } catch (error) {
      const existing = inspectPython(python);
      console.log(`[INCOMPATIBLE/INCOMPLETE] Optional emulator environment: ${existing ? `Python ${existing.version.join('.')} (${existing.bits}-bit)` : 'Python cannot run'}. ${error.message}`);
    }
  }
  if (!fs.existsSync(python)) {
    console.log(`[MISSING] Project-local emulator Python (${python}). Creating the optional environment.`);
    run(choosePython(), ['-m', 'venv', environment]);
  }
  const info = inspectPython(python);
  if (!info || info.bits !== 64 || !pythonSupported(info.version)) throw new Error(`Existing emulator Python is ${info ? `${info.version.join('.')} (${info.bits}-bit)` : 'unusable'}; tools/emulator-env needs 64-bit Python 3.10-3.13. Rename the old environment and run setup:emulator again. Normal ROM builds do not need it.`);
  console.log('[INFO] Installing or repairing pinned packages in the project-local emulator environment only.');
  run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(root, 'tests/emulator-requirements.txt')]);
  verifyEmulator(python);
  console.log('Emulator environment installed in tools/emulator-env. No activation needed.');
}
async function main(args) {
  if (args.includes('--help')) { console.log('Usage: npm.cmd run setup -- [--emulator] [--rgbds-archive path.zip]'); return; }
  if (process.platform !== 'win32') throw new Error(`Automatic setup supports 64-bit Windows; detected ${process.platform}/${process.arch}.`);
  let archive;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--emulator') continue;
    if (args[i] === '--rgbds-archive' && args[i + 1] && !args[i + 1].startsWith('--')) archive = args[++i];
    else throw new Error(`Unknown or incomplete setup option: ${args[i]}`);
  }
  try { console.log(`[OK] Node.js: ${checkNode()}`); }
  catch (error) { throw new Error(`[INCOMPATIBLE] Node.js: ${error.message}`); }
  let actual;
  try { actual = require('jison/package.json').version; } catch {}
  try { checkLockedDependency('jison', actual); }
  catch (error) { throw new Error(`[${actual ? 'INCOMPATIBLE' : 'MISSING'}] Jison: ${error.message}`); }
  console.log(`[OK] Jison: installed ${actual}, matches the lockfile.`);
  await installRGBDS(archive);
  if (args.includes('--emulator')) installEmulator();
  doctor(args.includes('--emulator'));
  console.log('Setup complete. Build your first ROM: npm.cmd run build -- examples/hello-world/main.pysn hello-world');
}
module.exports = { checkArchive, removeStaging, describeRGBDS, choosePython, main };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
