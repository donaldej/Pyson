'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { toolPath, doctor } = require('./environment');

function run(name, args) {
  const result = spawnSync(toolPath(name), args, {
    cwd: root, encoding: 'utf8', windowsHide: true
  });
  if (result.error) throw new Error(`${name}: ${result.error.message}. Run npm.cmd run setup to install RGBDS locally.`);
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout}`);
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.log(result.stderr.trim());
}

function assemble(source, name) {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'binary'), { recursive: true });
  const object = path.join(root, 'build', `${name}.o`);
  const rom = path.join(root, 'binary', `${name}.gb`);
  run('rgbasm', ['-I', path.join(root, 'include') + path.sep, '-o', object, source]);
  run('rgblink', ['-n', path.join(root, 'build', `${name}.sym`), '-o', rom, object]);
  run('rgbfix', ['-v', '-p', '0xFF', rom]);
  console.log(`ROM: ${rom}`);
  return rom;
}

module.exports = { assemble };

if (require.main === module) {
try {
  switch (process.argv[2]) {
    case 'doctor':
      doctor(process.argv.includes('--emulator'));
      break;
    case 'smoke': {
      const { Parser } = require('jison');
      const parser = new Parser({
        lex: { rules: [['\\s+', '/* skip whitespace */'], ['[0-9]+', "return 'NUMBER';"], ['$', "return 'EOF';"]] },
        bnf: { input: [['NUMBER EOF', 'return Number($1);']] }
      });
      if (parser.parse('42') !== 42) throw new Error('Jison smoke check failed');
      console.log('Jison parser generation and parsing passed.');
      const rom = assemble(path.join(root, 'examples', 'toolchain-smoke.asm'), 'toolchain-smoke');
      const bytes = fs.readFileSync(rom);
      let checksum = 0;
      for (let i = 0x134; i <= 0x14c; i++) checksum = (checksum - bytes[i] - 1) & 0xff;
      if (bytes.length !== 32768 || bytes[0x14d] !== checksum) throw new Error('ROM size or header checksum check failed');
      console.log('RGBDS assembly, linking, and ROM header checks passed.');
      break;
    }
    case 'assemble': {
      if (!process.argv[3]) throw new Error('Usage: npm run build:asm -- path/to/game.asm [output-name]');
      const name = process.argv[4] || 'pyson';
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Output name must contain letters, numbers, underscores or hyphens.');
      assemble(path.resolve(process.argv[3]), name);
      break;
    }
    default: throw new Error('Expected doctor, smoke, or assemble.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
}
