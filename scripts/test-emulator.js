'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, doctor } = require('./environment');
try {
  doctor(true);
  const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name === 'runtime.test.js' || name.endsWith('-runtime.test.js')).sort();
  const result = spawnSync(process.execPath, ['--test', ...tests.map(name => path.join(root, 'tests', name))], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
} catch (error) { console.error(error.message); process.exitCode = 1; }
