'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('./toolchain.json');
const root = path.resolve(__dirname, '..');

function execute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000, ...options });
}
function toolPath(name) {
  const executable = name + (process.platform === 'win32' ? '.exe' : '');
  const local = path.join(root, 'tools', 'rgbds', executable);
  return fs.existsSync(local) ? local : executable;
}
function rgbdsVersion(executable) {
  const result = execute(executable, ['-V']);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Could not run RGBDS');
  const version = `${result.stdout}\n${result.stderr}`.match(/\bv(\d+\.\d+\.\d+)\b/)?.[1];
  if (!version) throw new Error('Could not identify RGBDS version');
  return version;
}
function inspectRGBDS(executable, readVersion = rgbdsVersion) {
  try {
    const version = readVersion(executable);
    return { executable, version, expected: config.rgbds.version,
      status: version === config.rgbds.version ? 'compatible' : 'incompatible' };
  } catch (error) {
    return { executable, expected: config.rgbds.version,
      status: error.code === 'ENOENT' ? 'missing' : 'unusable', detail: error.message };
  }
}
function checkNode(version = process.versions.node, arch = process.arch) {
  const minimum = Number(require('../package.json').engines.node.match(/\d+/)[0]);
  if (Number(version.split('.')[0]) < minimum) throw new Error(`Installed Node ${version}; Pyson requires Node ${minimum} or newer. Install a supported 64-bit Node.js release, then reopen PowerShell.`);
  if (arch !== 'x64') throw new Error(`Installed Node ${version} (${arch}); automatic setup requires 64-bit x64 Node.js.`);
  return `${version} (${arch})`;
}
function pythonSupported(version) {
  const [major, minor] = version;
  const number = major * 100 + minor;
  return number >= config.python.min[0] * 100 + config.python.min[1] && number < config.python.maxExclusive[0] * 100 + config.python.maxExclusive[1];
}
function inspectPython(command, args = []) {
  const result = execute(command, [...args, '-c', 'import sys,json,struct; print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:3]),"bits":struct.calcsize("P")*8}))']);
  if (result.error || result.status !== 0) return null;
  try { return JSON.parse(result.stdout.trim()); } catch { return null; }
}
function emulatorPython() {
  return process.env.PYSON_EMULATOR_PYTHON || process.env.GBPY_EMULATOR_PYTHON || path.join(root, 'tools', 'emulator-env', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}
function checkLockedDependency(name, actual, manifest = require('../package.json'), lock = require('../package-lock.json')) {
  const requested = manifest.devDependencies?.[name] ?? manifest.dependencies?.[name];
  const lockedRequest = lock.packages?.['']?.devDependencies?.[name] ?? lock.packages?.['']?.dependencies?.[name];
  if (!requested || requested !== lockedRequest) {
    throw new Error('package.json and package-lock.json disagree. Restore matching files or run npm.cmd install to update the lockfile.');
  }
  const expected = lock.packages?.[`node_modules/${name}`]?.version;
  if (!expected || actual !== expected) throw new Error(`Expected locked ${name} ${expected || '(missing)'}, found ${actual || '(missing)'}. Run npm.cmd ci.`);
  return actual;
}
function verifyEmulator(python) {
  const info = inspectPython(python);
  if (!info || info.bits !== 64 || !pythonSupported(info.version)) throw new Error('Emulator tests require Python 3.10–3.13. Run npm.cmd run setup:emulator.');
  const result = execute(python, ['-c', 'import importlib.metadata as m,json\nversions={}\nfor n in ["pyboy","numpy","PySDL2","pysdl2-dll"]:\n try: versions[n]=m.version(n)\n except m.PackageNotFoundError: versions[n]=None\nprint(json.dumps(versions))']);
  if (result.error || result.status !== 0) throw new Error('Emulator packages are missing. Run npm.cmd run setup:emulator.');
  const versions = JSON.parse(result.stdout.trim());
  checkEmulatorPackages(versions);
  return { ...info, packages: versions };
}
function checkEmulatorPackages(versions, requirements = fs.readFileSync(path.join(root, 'tests/emulator-requirements.txt'), 'utf8'), platform = process.platform) {
  const mismatches = [];
  for (const line of requirements.split(/\r?\n/)) {
    const match = /^([\w-]+)==([^;\s]+)/.exec(line);
    if (match && !(platform !== 'win32' && /sys_platform == "win32"/.test(line)) && versions[match[1]] !== match[2]) {
      mismatches.push(`${match[1]}: installed ${versions[match[1]] || '(missing)'}, required ${match[2]}`);
    }
  }
  if (mismatches.length) throw new Error(`${mismatches.join('; ')}. Run npm.cmd run setup:emulator.`);
}
function doctor(requireEmulator = false) {
  let failures = 0;
  const check = (label, action) => {
    try { console.log(`[OK] ${label}: ${action()}`); } catch (error) { failures++; console.error(`[MISSING/INCOMPATIBLE] ${label}: ${error.message}`); }
  };
  check('Node', () => checkNode());
  check('Jison', () => {
    let version;
    try { version = require('jison/package.json').version; } catch { throw new Error('Run npm.cmd ci.'); }
    return checkLockedDependency('jison', version);
  });
  for (const name of config.rgbds.requiredTools) check(name, () => {
    const executable = toolPath(name);
    let version;
    try { version = rgbdsVersion(executable); } catch { throw new Error('Run npm.cmd run setup.'); }
    if (version !== config.rgbds.version) throw new Error(`Expected ${config.rgbds.version}, found ${version}. Run npm.cmd run setup.`);
    return `${version} (${executable})`;
  });
  console.log('[OPTIONAL] rgbgfx: not required; Pyson converts BMP graphics itself.');
  if (requireEmulator) check('Emulator environment', () => {
    const info = verifyEmulator(emulatorPython());
    return `Python ${info.version.join('.')}, PyBoy ${info.packages.pyboy}`;
  });
  else console.log('[OPTIONAL] Emulator environment: not checked. Use npm.cmd run doctor -- --emulator to check it, or npm.cmd run setup:emulator to install it.');
  console.log('[OPTIONAL] BGB/other emulators and FFmpeg: not required to build ROMs.');
  if (failures) throw new Error(`${failures} environment check(s) failed.`);
}
module.exports = { root, config, execute, toolPath, rgbdsVersion, inspectRGBDS, checkNode, pythonSupported, inspectPython, emulatorPython, verifyEmulator, checkEmulatorPackages, checkLockedDependency, doctor };
