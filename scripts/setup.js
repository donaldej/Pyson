'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { root, config, execute, rgbdsVersion, pythonSupported, inspectPython, verifyEmulator, doctor } = require('./environment');

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
  const installed = config.rgbds.tools.every(name => {
    try { return rgbdsVersion(path.join(destination, name + '.exe')) === config.rgbds.version; } catch { return false; }
  });
  if (installed && !archive) { console.log(`RGBDS ${config.rgbds.version} is already installed locally.`); return; }
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
function choosePython() {
  const candidates = [];
  const requestedPython = process.env.PYSON_SETUP_PYTHON || process.env.GBPY_SETUP_PYTHON;
  if (requestedPython) candidates.push([requestedPython, []]);
  else {
    for (const minor of [13, 12, 11, 10]) candidates.push(['py.exe', [`-3.${minor}`]]);
    candidates.push(['python.exe', []]);
  }
  for (const [command, args] of candidates) {
    const info = inspectPython(command, args);
    if (info && info.bits === 64 && pythonSupported(info.version)) return info.executable;
  }
  throw new Error('Install 64-bit Python 3.10–3.13 with the Python launcher, or set PYSON_SETUP_PYTHON to its executable.');
}
function installEmulator() {
  const environment = path.join(root, 'tools/emulator-env');
  const python = path.join(environment, 'Scripts/python.exe');
  if (!fs.existsSync(python)) run(choosePython(), ['-m', 'venv', environment]);
  const info = inspectPython(python);
  if (!info || info.bits !== 64 || !pythonSupported(info.version)) throw new Error('tools/emulator-env needs Python 3.10–3.13. Rename the old environment and run setup:emulator again.');
  run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(root, 'tests/emulator-requirements.txt')]);
  verifyEmulator(python);
  console.log('Emulator environment installed in tools/emulator-env. No activation needed.');
}
async function main(args) {
  if (args.includes('--help')) { console.log('Usage: npm.cmd run setup -- [--emulator] [--rgbds-archive path.zip]'); return; }
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Automatic setup currently supports 64-bit Windows only.');
  let archive;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--emulator') continue;
    if (args[i] === '--rgbds-archive' && args[i + 1] && !args[i + 1].startsWith('--')) archive = args[++i];
    else throw new Error(`Unknown or incomplete setup option: ${args[i]}`);
  }
  const expected = require('../package.json').devDependencies.jison;
  let actual;
  try { actual = require('jison/package.json').version; } catch {}
  if (actual !== expected) throw new Error('Install JavaScript dependencies first: npm.cmd ci.');
  await installRGBDS(archive);
  if (args.includes('--emulator')) installEmulator();
  doctor(args.includes('--emulator'));
  console.log('Setup complete. Build an example with npm.cmd run build -- examples/star-chase/main.pysn star-chase.');
}
module.exports = { checkArchive, removeStaging, main };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
