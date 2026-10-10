'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('compiler shows source text and a usable fractional-number fix', () => {
  assert.throws(() => compile('position = 1.5\nprint(position, 0, 0)\n', 'sample.pysn'), error => {
    assert.match(error.message, /2 \| print\(position, 0, 0\)/);
    assert.match(error.message, /Hint:.*int\(position\)/);
    assert.equal(error.diagnostic.filename, 'sample.pysn');
    return true;
  });
  assert.doesNotThrow(() => compile('position = 1.5\nprint(int(position), 0, 0)\n'));
});

test('named argument mistakes list the accepted public names', () => {
  assert.throws(() => compile('print(value="Hello", column=0, y=0)\n'), /Use these argument names for print: value, x, y, palette/);
  assert.doesNotThrow(() => compile('print(value="Hello", x=0, y=0)\n'));
});

test('imported failures show the imported line instead of the main line', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pyson-diagnostics-'));
  try {
    fs.writeFileSync(path.join(directory, 'broken.pysn'), 'def draw():\n    print(missing, 0, 0)\n');
    assert.throws(() => compile('import broken\nbroken.draw()\n', path.join(directory, 'main.pysn')), error => {
      assert.match(error.message, /2 \|     print\(missing, 0, 0\)/);
      assert.equal(error.diagnostic.filename, path.join(directory, 'broken.pysn'));
      assert.match(error.message, /Hint: Check the spelling/);
      return true;
    });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('parse errors show the input line without inventing a fix', () => {
  assert.throws(() => compile('print(, 0, 0)\n', 'memory.pysn'), error => {
    assert.match(error.message, /memory.pysn:/);
    assert.ok(error.diagnostic.line);
    assert.equal(error.diagnostic.hint, null);
    return true;
  });
});

test('errors without a known line preserve the original explanation', () => {
  assert.throws(() => compile('header.target = "invalid"\n'), /header.target must be/);
  assert.throws(() => compile('print(\n'), /Unclosed/);
});
