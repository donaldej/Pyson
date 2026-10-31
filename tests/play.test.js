'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { play } = require('../scripts/play');
const { root } = require('../scripts/environment');

test('play builds first, launches the resulting ROM with interactive SDL2 and propagates exit status', () => {
  const calls = [];
  const result = play(['examples/hello-world/main.pysn', 'play-test'], {
    python: 'python with spaces.exe', verify: () => {},
    run: (...args) => { calls.push(args); return { status: calls.length === 1 ? 0 : 7 }; }
  });
  assert.equal(result, 7);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], [path.join(root, 'src/cli.js'), path.resolve('examples/hello-world/main.pysn'), 'play-test']);
  assert.equal(calls[1][0], 'python with spaces.exe');
  assert.deepEqual(calls[1][1], ['-m', 'pyboy', path.join(root, 'binary/play-test.gb'), '--window', 'SDL2', '--scale', '3']);
  assert.equal(calls[1][2].stdio, 'inherit');
});

test('play never launches a stale ROM after a failed build', () => {
  let calls = 0;
  assert.equal(play(['broken.pysn'], { verify: () => {}, run: () => { calls++; return { status: 1 }; } }), 1);
  assert.equal(calls, 1);
});

test('play reports missing optional tools before building and validates arguments', () => {
  const dependencies = { verify: () => { throw new Error('Missing Python'); }, run: () => assert.fail('must not launch') };
  assert.throws(() => play(['game.pysn'], dependencies), /setup:emulator/);
  for (const args of [[], ['game.pysn', '../bad'], ['game.pysn', 'ok', 'extra']]) {
    assert.throws(() => play(args, dependencies), /Usage:/);
  }
});
