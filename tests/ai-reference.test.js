'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, defaults } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { signatures } = require('../src/builtin-arguments');
const root = path.resolve(__dirname, '..');
const manual = fs.readFileSync(path.join(root, 'AI_REFERENCE.md'), 'utf8');

test('AI reference covers every configurable header and its local reference links exist', () => {
  const headerFields = [...manual.matchAll(/^\| `header\.([a-z_]+)` \|/gm)].map(match => match[1]).sort();
  assert.deepEqual(headerFields, Object.keys(defaults).sort());
  for (const link of manual.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(link[1])) continue;
    assert.ok(fs.existsSync(path.resolve(root, link[1])), `Broken manual link: ${link[1]}`);
  }
});

test('AI reference signature catalog tracks every fixed built-in and its actual defaults', () => {
  const catalog = manual.split('<!-- API-SIGNATURES:BEGIN -->')[1]?.split('<!-- API-SIGNATURES:END -->')[0];
  assert.ok(catalog);
  const entries = [...catalog.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]);
  assert.equal(entries.length, Object.keys(signatures).length);
  for (const [name, params] of Object.entries(signatures)) {
    const formatted = params.map(param => {
      if (!Array.isArray(param)) return param;
      const [key, value] = param;
      const fallback = value === null ? name === 'worldmap' ? 'omitted' : 'effect default'
        : typeof value === 'boolean' ? value ? 'True' : 'False' : JSON.stringify(value);
      return `${key}=${fallback}`;
    }).join(', ');
    assert.ok(entries.includes(`${name}(${formatted})`), `Update AI_REFERENCE.md for ${name}`);
  }
});

test('every complete AI manual program compiles and assembles against included assets', () => {
  const blocks = [...manual.matchAll(/^```pyson(?: file=([^\r\n]+))?\r?\n([\s\S]*?)^```/gm)];
  assert.equal(blocks.filter(block => !block[1]).length, 6, 'Review changes to the complete program set');
  const directory = path.join(root, 'build/tests/ai-reference');
  fs.mkdirSync(directory, { recursive: true });
  let count = 0;
  function build(source, filename, name) {
    const result = compile(source, filename);
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const rom = fs.readFileSync(assemble(asm, name));
    assert.ok(rom.length >= 32768);
    return result;
  }
  for (const block of blocks.filter(block => !block[1])) {
    // Repository asset paths in standalone examples are relative to examples/.
    build(block[2], path.join(root, 'examples/ai-reference.pysn'), `ai-reference-${++count}`);
  }
  const modules = path.join(directory, 'modules');
  for (const block of blocks.filter(block => block[1])) {
    const file = path.resolve(modules, block[1]);
    assert.ok(file.startsWith(modules + path.sep), 'Module fixture escaped its directory');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, block[2]);
  }
  const entry = path.join(modules, 'main.pysn');
  const compiled = build(fs.readFileSync(entry, 'utf8'), entry, 'ai-reference-modules');
  assert.equal(compiled.symbols.filter(symbol => symbol.name === 'includes.state.score').length, 1);
});
