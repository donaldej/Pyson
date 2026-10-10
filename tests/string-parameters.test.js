'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('string parameter types propagate through forward calls, helpers and aliases', () => {
  const result = compile(`def outer(text, row=0):
    inner(value=text, row=row)
def inner(value, row):
    alias = value
    print(alias, 0, row)
outer("HELLO")
message = "WORLD"
outer(row=1, text=message)
outer(text=format_text("SCORE {}", 12), row=2)`);
  for (const name of ['text', 'value', 'alias']) {
    const symbol = result.symbols.find(symbol => symbol.name === name);
    assert.equal(symbol.type, 'string');
    assert.equal(symbol.bytes ?? 2, 2);
  }
  assert.match(result.assembly, /call PrintAt/);
});

test('imported text helpers infer shared string parameters without duplicating definitions', () => {
  const dir = path.resolve(__dirname, '../build/tests/string-modules');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ui.pysn'), 'def label(text, row=0):\n    print(text, 0, row)\n');
  const result = compile('import ui\nui.label("FIRST")\nui.label(text="SECOND", row=1)', path.join(dir, 'main.pysn'));
  assert.equal(result.symbols.filter(symbol => symbol.scope === 'ui.label' && symbol.type === 'string').length, 1);
});

test('fixed parameter types and existing restrictions reject unsafe string operations', () => {
  for (const source of [
    'def f(text):\n    print(text, 0, 0)\nf("HI")\nf(1)',
    'def f(text):\n    print(text, 0, 0)\nf(1)\nf("HI")',
    'def f(text):\n    text = 1\nf("HI")',
    'def f(text):\n    return text + 1\nf("HI")',
    'def f(text):\n    return text\nf("HI")',
    'def f(text="HI"):\n    print(text, 0, 0)\nf()',
    'def f(text):\n    f(text)\nf("HI")',
    'def f(text):\n    print(text, 0, 0)\nf(message)\nmessage = "LATE"'
  ]) assert.throws(() => compile(source), undefined, source);
});
