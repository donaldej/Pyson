'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Parser } = require('jison');
const { Lexer } = require('./lexer');
const parser = new Parser(fs.readFileSync(path.join(__dirname, '../jison/language.jison'), 'utf8'));
parser.lexer = new Lexer();
parser.yy.string = raw => raw.slice(1, -1).replace(/\\(.)/g, (_, c) => {
  const escapes = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
  if (!(c in escapes)) throw new Error(`Unsupported string escape: \\${c}`);
  return escapes[c];
});
module.exports = { parse: source => parser.parse(source) };
