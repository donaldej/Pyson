'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compile } = require('../src/compiler');

function project(files, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pyson-modules-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(directory, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    return run(source => compile(source, path.join(directory, 'main.pysn')), directory);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('module namespaces, aliases and diamond dependencies resolve once', () => {
  project({
    'includes/state.pysn': 'value = 7\ndef add(x):\n    global value\n    value += x\n    return value',
    'screens/one.pysn': 'import includes.state as state\ndef update():\n    return state.add(1)',
    'screens/two.pysn': 'from includes.state import add as bump\ndef update():\n    return bump(2)'
  }, compileProject => {
    const result = compileProject('header.target = "dual"\nimport screens.one\nimport screens.two as second\nfrom screens.one import update as first\na = first()\nb = second.update()\nc = screens.one.update()');
    assert.equal(result.modules.length, 4);
    assert.equal(result.ast.filter(node => node.name === 'includes.state.value' && node.type === 'assign').length, 1);
    assert.equal(result.symbols.filter(symbol => symbol.name === 'includes.state.value').length, 1);
    assert.equal(result.ast.filter(node => node.type === 'function' && node.name.endsWith('.update')).length, 2);
  });
});

test('global shares storage while ordinary function assignments stay local', () => {
  const result = compile('counter = 1\ndef bump():\n    global counter\n    counter += 1\n    return counter\ndef local():\n    counter = 9\n    return counter\nx = bump()\ny = local()');
  assert.equal(result.symbols.filter(symbol => symbol.name === 'counter').length, 2);
  assert.throws(() => compile('def bump():\n    global counter\n    counter += 1\nx = bump()\ncounter = 0'), /before assignment/);
  assert.throws(() => compile('counter = 0\ndef bump(counter):\n    global counter'), /Parameter/);
  assert.throws(() => compile('counter = 0\ndef bump():\n    counter += 1\n    global counter'), /must precede/);
  assert.throws(() => compile('counter = 0\ndef bump():\n    print(counter, 0, 0)\n    global counter'), /must precede/);
  assert.throws(() => compile('global counter'), /inside a function/);
  assert.throws(() => compile('counter = 0\ndef bump():\n    if counter:\n        pass\n    global counter'), /must precede/);
  compile('counter = 0\ndef bump():\n    if True:\n        global counter\n    elif counter:\n        pass\n    counter += 1\nbump()');
});

test('module-owned globals and explicit main-owned globals can be updated', () => {
  project({ 'helper.pysn': 'value = 1\ndef bump():\n    global value, score\n    value += 1\n    score += value\n    return score' }, compileProject => {
    const result = compileProject('import helper\nscore = 0\nx = helper.bump()');
    assert.deepEqual(result.ast.find(node => node.type === 'function').body[0].names, ['helper.value', 'score']);
    assert.equal(result.symbols.filter(symbol => symbol.name === 'score').length, 1);
  });
});

test('module assets resolve relative to the file declaring them', () => {
  project({ 'includes/art.pysn': 'hero = sprite_sheet("../assets/hero.bmp", 16, 16)' }, (compileProject, directory) => {
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.copyFileSync(path.join(__dirname, '../examples/assets/hero.bmp'), path.join(directory, 'assets/hero.bmp'));
    const result = compileProject('import includes.art as art\nsprite(0, art.hero, 0, 40, 40)');
    assert.equal(result.assets[0].file, path.join(directory, 'assets/hero.bmp'));
  });
});

test('missing modules, exports, cycles and binding conflicts have source diagnostics', () => {
  project({
    'a.pysn': 'import b\ndef run():\n    pass',
    'b.pysn': 'import a',
    'helper.pysn': 'value = 0\ndef run():\n    pass',
    'broken.pysn': 'def run():\n    return missing',
    'badheader.pysn': 'header.title = "NO"',
    'badloop.pysn': 'while True:\n    pass'
  }, compileProject => {
    for (const [source, expected] of [
      ['import nowhere', /main\.pysn: Line 1: Cannot import/],
      ['import a', /b\.pysn: Line 1: Circular import/],
      ['from helper import missing', /no export/],
      ['from helper import value', /support functions/],
      ['import helper\nhelper.missing()', /no export/],
      ['import helper\nhelper.run = 1', /Cannot assign to function/],
      ['import helper as x\nx = 1', /conflicts/],
      ['def run():\n    import helper', /top level/],
      ['import helper\ndef run(helper):\n    return helper.value\nx = run(1)', /local variable/],
      ['if True:\n    import helper', /top level/],
      ['import broken\nx = broken.run()', /broken\.pysn: Line 2: Undefined/],
      ['import badheader', /badheader\.pysn: Line 1: Imported modules/],
      ['import badloop', /Imported modules/],
      ['x = 1\nheader.title = "LATE"\nimport helper', /before executable/]
    ]) assert.throws(() => compileProject(source), expected, source);
  });
});
