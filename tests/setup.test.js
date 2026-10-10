'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkArchive, removeStaging } = require('../scripts/setup');
const { root, pythonSupported } = require('../scripts/environment');

test('setup rejects altered downloads and cleanup paths outside its own staging directories', () => {
  const directory = path.join(root, 'build/tests/setup');
  fs.mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, 'altered.zip');
  fs.writeFileSync(archive, 'not the official RGBDS release');
  assert.throws(() => checkArchive(archive), /checksum mismatch/);
  assert.throws(() => removeStaging(root), /Invalid setup cleanup directory/);
  assert.throws(() => removeStaging(path.join(root, 'tools')), /Invalid setup cleanup directory/);
  assert.throws(() => removeStaging(path.join(root, 'tools/.setup-rgbds-outside/nested')), /Invalid setup cleanup directory/);
  assert.equal(fs.readFileSync(archive, 'utf8'), 'not the official RGBDS release');
});

test('the emulator Python range matches the pinned dependency generation', () => {
  assert.equal(pythonSupported([3, 9, 9]), false);
  assert.equal(pythonSupported([3, 10, 0]), true);
  assert.equal(pythonSupported([3, 13, 9]), true);
  assert.equal(pythonSupported([3, 14, 0]), false);
  assert.equal(pythonSupported([4, 0, 0]), false);
});
