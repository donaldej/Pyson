'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { makeReport } = require('../src/build-report');
const { assemble } = require('./dev');
const { emulatorPython } = require('./environment');
const root = path.resolve(__dirname, '..');

function options(args) {
  const config = { frames: 600, warmup: 30, target: null, input: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--frames', '--warmup', '--target'].includes(arg)) {
      if (!args[i + 1]) throw new Error(`${arg} requires a value`);
      config[arg.slice(2)] = args[++i];
    } else if (!arg.startsWith('-') && !config.input) config.input = path.resolve(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [name, minimum] of [['frames', 1], ['warmup', 0]]) {
    if (!/^\d+$/.test(String(config[name])) || Number(config[name]) < minimum || Number(config[name]) > 20000) throw new Error(`--${name} must be ${minimum}..20000`);
    config[name] = Number(config[name]);
  }
  if (!config.input || (config.target && !['dmg', 'cgb'].includes(config.target))) throw new Error('Usage: npm.cmd run profile -- project.pysn [--frames 600] [--warmup 30] [--target dmg|cgb]');
  return config;
}

function profile(config) {
  const python = emulatorPython();
  if (!fs.existsSync(python)) throw new Error('Profiling needs the optional emulator environment. Run npm.cmd run setup:emulator.');
  const compiled = compile(fs.readFileSync(config.input, 'utf8'), config.input);
  const target = config.target || (compiled.header.target === 'dmg' ? 'dmg' : 'cgb');
  if (target === 'dmg' && compiled.header.target === 'cgb') throw new Error('This project requires Game Boy Color; use --target cgb.');
  const name = 'profile-' + path.basename(path.dirname(config.input)).replace(/[^A-Za-z0-9_-]/g, '-') + '-' + path.basename(config.input, '.pysn').replace(/[^A-Za-z0-9_-]/g, '-');
  const directory = path.join(root, 'build', 'profiles', name);
  fs.mkdirSync(directory, { recursive: true });
  const asm = path.join(directory, 'program.asm');
  fs.writeFileSync(asm, compiled.assembly);
  const rom = assemble(asm, name);
  const symbols = path.join(root, 'build', name + '.sym');
  const report = makeReport(compiled, fs.readFileSync(symbols, 'utf8'), fs.statSync(rom).size);
  const output = path.join(directory, 'profile.json');
  const manifest = path.join(directory, 'input.json');
  fs.writeFileSync(manifest, JSON.stringify({ rom, symbols, report, target, frames: config.frames, warmup: config.warmup, output, ramBytes: compiled.header.ram_kb * 1024 }));
  const run = spawnSync(python, [path.join(__dirname, 'profile.py'), manifest], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  if (run.status !== 0) throw new Error(run.error?.message || run.stderr || run.stdout);
  console.log(run.stdout.trim());
  console.log(`Profile: ${output}`);
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

module.exports = { options, profile };
if (require.main === module) {
  try { profile(options(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
