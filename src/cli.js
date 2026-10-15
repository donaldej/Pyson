'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('./compiler');
const { assemble } = require('../scripts/dev');
const { makeReport, formatReport } = require('./build-report');
try {
  const [input, name = 'pyson'] = process.argv.slice(2);
  if (!input || !/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Usage: npm run build -- project.pysn [output-name]');
  const compiled = compile(fs.readFileSync(path.resolve(input), 'utf8'), input);
  const { assembly, assets, sounds, banking, save, animations, music, symbols } = compiled;
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  const output = path.join(root, 'build', `${name}.asm`);
  fs.writeFileSync(output, assembly);
  fs.writeFileSync(path.join(root, 'build', `${name}.assets.json`), JSON.stringify(assets, null, 2));
  fs.writeFileSync(path.join(root, 'build', `${name}.sounds.json`), JSON.stringify(sounds, null, 2));
  fs.writeFileSync(path.join(root, 'build', `${name}.banks.json`), JSON.stringify(banking, null, 2));
  fs.writeFileSync(path.join(root, 'build', `${name}.save.json`), JSON.stringify(save, null, 2));
  fs.writeFileSync(path.join(root, 'build', `${name}.animations.json`), JSON.stringify(animations, null, 2));
  fs.writeFileSync(path.join(root, 'build', `${name}.music.json`), JSON.stringify(music, null, 2));
  console.log(`Assembly: ${output}`);
  assemble(output, name);
  const addresses = new Map(fs.readFileSync(path.join(root, 'build', `${name}.sym`), 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith(';')).map(line => {
      const [address, symbol] = line.trim().split(/\s+/);
      return [symbol, parseInt(address.split(':')[1], 16)];
    }));
  const variables = symbols.map(symbol => ({ ...symbol, bytes: symbol.bytes ?? 2, address: addresses.get(symbol.label) }));
  const memory = { wramCapacityBytes: 4096, wramUsedBytes: addresses.get('wStateEnd') - 0xc000,
    namedVariableBytes: variables.reduce((total, symbol) => total + symbol.bytes, 0), variables };
  fs.writeFileSync(path.join(root, 'build', `${name}.memory.json`), JSON.stringify(memory, null, 2));
  const report = makeReport(compiled, fs.readFileSync(path.join(root, 'build', `${name}.sym`), 'utf8'), fs.statSync(path.join(root, 'binary', `${name}.gb`)).size);
  fs.writeFileSync(path.join(root, 'build', `${name}.report.json`), JSON.stringify(report, null, 2));
  const readableReport = path.join(root, 'build', `${name}.report.txt`);
  fs.writeFileSync(readableReport, formatReport(report));
  console.log(`Report: ${path.join(root, 'build', `${name}.report.json`)} (${report.romBytes / 1024} KB ROM, ${report.wramFreeBytes} WRAM bytes free)`);
  console.log(`WRAM: ${memory.wramUsedBytes}/4096 bytes (${memory.namedVariableBytes} bytes of named variables)`);
  console.log(`Readable graphics and memory report: ${readableReport}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
