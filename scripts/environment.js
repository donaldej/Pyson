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
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Could not run RGBDS');
  const version = `${result.stdout}\n${result.stderr}`.match(/\bv(\d+\.\d+\.\d+)\b/)?.[1];
  if (!version) throw new Error('Could not identify RGBDS version');
  return version;
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
function verifyEmulator(python) {
  const info = inspectPython(python);
  if (!info || info.bits !== 64 || !pythonSupported(info.version)) throw new Error('Emulator tests require Python 3.10–3.13. Run npm.cmd run setup:emulator.');
  const result = execute(python, ['-c', 'import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ["pyboy","numpy","PySDL2","pysdl2-dll"]}))']);
  if (result.error || result.status !== 0) throw new Error('Emulator packages are missing. Run npm.cmd run setup:emulator.');
  const versions = JSON.parse(result.stdout.trim());
  const requirements = fs.readFileSync(path.join(root, 'tests/emulator-requirements.txt'), 'utf8');
  for (const line of requirements.split(/\r?\n/)) {
    const match = /^([\w-]+)==([^;\s]+)/.exec(line);
    if (match && !(process.platform !== 'win32' && /sys_platform == "win32"/.test(line)) && versions[match[1]] !== match[2]) {
      throw new Error(`${match[1]} ${versions[match[1]]} does not match ${match[2]}. Run npm.cmd run setup:emulator.`);
    }
  }
  return { ...info, packages: versions };
}
function doctor(requireEmulator = false) {
  let failures = 0;
  const check = (label, action) => {
    try { console.log(`[OK] ${label}: ${action()}`); } catch (error) { failures++; console.error(`[MISSING/INCOMPATIBLE] ${label}: ${error.message}`); }
  };
  check('Node', () => {
    const minimum = Number(require('../package.json').engines.node.match(/\d+/)[0]);
    if (Number(process.versions.node.split('.')[0]) < minimum) throw new Error(`Install Node ${minimum} or newer.`);
    return process.version;
  });
  check('Jison', () => {
    let version;
    try { version = require('jison/package.json').version; } catch { throw new Error('Run npm.cmd ci.'); }
    const expected = require('../package.json').devDependencies.jison;
    if (version !== expected) throw new Error(`Expected ${expected}, found ${version}. Run npm.cmd ci.`);
    return version;
  });
  for (const name of config.rgbds.tools) check(name, () => {
    const executable = toolPath(name);
    let version;
    try { version = rgbdsVersion(executable); } catch { throw new Error('Run npm.cmd run setup.'); }
    if (version !== config.rgbds.version) throw new Error(`Expected ${config.rgbds.version}, found ${version}. Run npm.cmd run setup.`);
    return `${version} (${executable})`;
  });
  const python = emulatorPython();
  if (requireEmulator || fs.existsSync(python)) check('Emulator environment', () => {
    const info = verifyEmulator(python);
    return `Python ${info.version.join('.')}, PyBoy ${info.packages.pyboy}`;
  });
  else console.log('[OPTIONAL] Emulator environment: run npm.cmd run setup:emulator to enable runtime tests.');
  if (failures) throw new Error(`${failures} environment check(s) failed.`);
}
module.exports = { root, config, execute, toolPath, rgbdsVersion, pythonSupported, inspectPython, emulatorPython, verifyEmulator, doctor };
