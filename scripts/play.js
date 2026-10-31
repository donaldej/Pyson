'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, emulatorPython, verifyEmulator } = require('./environment');

function play(args, dependencies = {}) {
  const run = dependencies.run || spawnSync;
  const verify = dependencies.verify || verifyEmulator;
  const python = dependencies.python || emulatorPython();
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: npm.cmd run play -- source.pysn [output-name]');
    return 0;
  }
  const [input, name = 'pyson'] = args;
  if (!input || args.length > 2 || input.startsWith('-') || !/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error('Usage: npm.cmd run play -- source.pysn [output-name]');
  }
  try { verify(python); } catch (error) {
    throw new Error(`Playing requires the optional PyBoy environment. Install 64-bit Python 3.10-3.13, then run npm.cmd run setup:emulator.\n${error.message}`);
  }
  const build = run(process.execPath, [path.join(root, 'src/cli.js'), path.resolve(input), name],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  if (build.error) throw build.error;
  if (build.status !== 0) return build.status ?? 1;
  console.log('Opening PyBoy. Arrows: move; A: A; S: B; Enter: Start; Backspace: Select. Close the window to exit.');
  const emulator = run(python, ['-m', 'pyboy', path.join(root, 'binary', `${name}.gb`), '--window', 'SDL2', '--scale', '3'],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  if (emulator.error) throw emulator.error;
  return emulator.status ?? 1;
}

if (require.main === module) {
  try { process.exitCode = play(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { play };
