'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkArchive, removeStaging, describeRGBDS, choosePython } = require('../scripts/setup');
const { root, config, toolPath, rgbdsVersion, inspectRGBDS, checkNode, pythonSupported, checkLockedDependency, checkEmulatorPackages } = require('../scripts/environment');

test('setup rejects altered downloads and cleanup paths outside its own staging directories', () => {
  const directory = path.join(root, 'build/tests/setup');
  fs.mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, 'altered.zip');
  fs.writeFileSync(archive, 'not the official RGBDS release');
  assert.throws(() => checkArchive(archive), /checksum mismatch/);
  assert.throws(() => removeStaging(root), /Invalid setup cleanup directory/);
  assert.throws(() => removeStaging(path.join(root, 'tools')), /Invalid setup cleanup directory/);
  assert.throws(() => removeStaging(path.join(root, 'tools/.setup-rgbds-outside/nested')), /Invalid setup cleanup directory/);
  assert.equal(fs.readFileSync(archive, 'utf8'), 'not the official RGBDS release');
});

test('the emulator Python range matches the pinned dependency generation', () => {
  assert.equal(pythonSupported([3, 9, 9]), false);
  assert.equal(pythonSupported([3, 10, 0]), true);
  assert.equal(pythonSupported([3, 13, 9]), true);
  assert.equal(pythonSupported([3, 14, 0]), false);
  assert.equal(pythonSupported([4, 0, 0]), false);
});

test('dependency checks compare installed versions to the lockfile, not a version range string', () => {
  const manifest = { devDependencies: { jison: '^0.4.18' } };
  const lock = { packages: { '': manifest, 'node_modules/jison': { version: '0.4.18' } } };
  assert.equal(checkLockedDependency('jison', '0.4.18', manifest, lock), '0.4.18');
  assert.throws(() => checkLockedDependency('jison', '0.4.17', manifest, lock), /Expected locked jison 0.4.18.*npm.cmd ci/);
  assert.throws(() => checkLockedDependency('jison', undefined, manifest, lock), /found \(missing\)/);
  assert.throws(() => checkLockedDependency('jison', '0.4.18', { devDependencies: { jison: '0.4.18' } }, lock), /package.json and package-lock.json disagree/);
});

test('only the assembler, linker and header fixer are required RGBDS tools', () => {
  assert.deepEqual(config.rgbds.requiredTools, ['rgbasm', 'rgblink', 'rgbfix']);
  assert.deepEqual(config.rgbds.optionalTools, ['rgbgfx']);
  assert.deepEqual([...config.rgbds.requiredTools, ...config.rgbds.optionalTools].sort(), [...config.rgbds.tools].sort());
});

test('installer identifies missing, wrong-version and unusable RGBDS tools individually', () => {
  const inspect = version => inspectRGBDS('rgbasm.exe', () => version);
  assert.equal(inspect(config.rgbds.version).status, 'compatible');
  const old = inspect('0.9.4');
  assert.equal(old.status, 'incompatible');
  assert.match(describeRGBDS('rgbasm', old, true), /INCOMPATIBLE.*installed 0.9.4.*requires 1.0.4.*replace this local/);
  assert.match(describeRGBDS('rgbasm', old, false), /INFO.*PATH.*will not be used after local setup/);
  const missing = inspectRGBDS('rgbasm.exe', () => { throw Object.assign(new Error('not found'), { code: 'ENOENT' }); });
  assert.equal(missing.status, 'missing');
  assert.match(describeRGBDS('rgbasm', missing, true), /MISSING.*Setup will install/);
  const broken = inspectRGBDS('rgbasm.exe', () => { throw new Error('cannot identify version'); });
  assert.equal(broken.status, 'unusable');
  assert.match(describeRGBDS('rgbasm', broken, true), /UNUSABLE.*repair this local/);
});

test('installer rejects an old or non-x64 Node runtime before installing tools', () => {
  assert.throws(() => checkNode('16.20.0', 'x64'), /Installed Node 16.20.0.*requires Node 18/);
  assert.throws(() => checkNode('24.0.0', 'ia32'), /ia32.*64-bit x64/);
  assert.equal(checkNode('24.0.0', 'x64'), '24.0.0 (x64)');
});

test('optional Python selection reports unsupported installs and finds a supported fallback', () => {
  const messages = [];
  const selected = choosePython((command, args) => args[0] === '-3.13'
    ? { executable: 'python313.exe', version: [3,13,2], bits: 64 }
    : { executable: 'python314.exe', version: [3,14,0], bits: 64 }, {}, message => messages.push(message));
  assert.equal(selected, 'python313.exe');
  assert.match(messages[0], /INCOMPATIBLE.*3.14.0.*will not be changed/);
  assert.match(messages[1], /OK.*3.13.2/);
});

test('an explicitly selected incompatible Python is explained rather than silently replaced', () => {
  const messages = [];
  assert.throws(() => choosePython(() => ({ executable: 'custom.exe', version: [3,12,1], bits: 32 }),
    { PYSON_SETUP_PYTHON: 'custom.exe' }, message => messages.push(message)), /Install 64-bit Python/);
  assert.match(messages[0], /INCOMPATIBLE.*3.12.1.*32-bit/);
});

test('optional package checks list every mismatched or missing package with its required version', () => {
  assert.throws(() => checkEmulatorPackages({ pyboy: '2.7.0', numpy: null }, 'pyboy==2.8.1\nnumpy==2.2.6\n', 'win32'), error => {
    assert.match(error.message, /pyboy: installed 2.7.0, required 2.8.1/);
    assert.match(error.message, /numpy: installed \(missing\), required 2.2.6/);
    return true;
  });
  assert.doesNotThrow(() => checkEmulatorPackages({}, 'pysdl2-dll==2.32.10; sys_platform == "win32"\n', 'linux'));
});

test('repair preflight checks Windows archive extraction before rejecting an altered local archive', { skip: process.platform !== 'win32' }, () => {
  const archive = path.join(root, 'build/tests/setup/preflight-invalid.zip');
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(archive, 'not the official archive');
  const result = spawnSync(process.execPath, ['scripts/setup.js', '--rgbds-archive', archive],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[OK\] Windows PowerShell.*archive extraction available/);
  assert.match(result.stderr, /RGBDS archive checksum mismatch/);
});

test('normal doctor ignores a broken optional emulator, while explicit emulator checks fail', t => {
  // The compiler/ROM suite needs RGBDS. Standalone setup tests can run before installation.
  if (!config.rgbds.requiredTools.every(name => { try { return rgbdsVersion(toolPath(name)) === config.rgbds.version; } catch { return false; } })) {
    t.skip('Install RGBDS to run the doctor integration check');
    return;
  }
  const options = { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, PYSON_EMULATOR_PYTHON: process.execPath } };
  const basic = spawnSync(process.execPath, ['scripts/dev.js', 'doctor'], options);
  assert.equal(basic.status, 0, basic.stdout + basic.stderr);
  assert.match(basic.stdout, /\[OPTIONAL\] Emulator environment: not checked/);
  assert.doesNotMatch(basic.stderr, /MISSING\/INCOMPATIBLE/);
  const explicit = spawnSync(process.execPath, ['scripts/dev.js', 'doctor', '--emulator'], options);
  assert.equal(explicit.status, 1, explicit.stdout + explicit.stderr);
  assert.match(explicit.stderr, /MISSING\/INCOMPATIBLE.*Emulator environment/);
});
