'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('double CPU speed is optional and requires a Color-compatible target', () => {
  const normal = compile('print("NORMAL", 0, 0)');
  assert.equal(normal.header.cpu_speed, 'normal');
  assert.doesNotMatch(normal.assembly, /InitCPUSpeed/);
  for (const target of ['dual', 'cgb']) {
    const fast = compile(`header.target = "${target}"\nheader.cpu_speed = "double"\nprint("FAST", 0, 0)`);
    assert.match(fast.assembly, /call InitCPUSpeed/);
    assert.match(fast.assembly, /cp \$11\n    ret nz/);
    assert.match(fast.assembly, /ldh \[\$FF4D\], a\n    stop/);
  }
  assert.throws(() => compile('header.cpu_speed = "double"'), /requires/);
  assert.throws(() => compile('header.cpu_speed = "fast"'), /normal.*double/);
  assert.throws(() => compile('header.cpu_speed = True'), /string/);
});
