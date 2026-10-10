'use strict';

const keywords = new Map(['header', 'if', 'elif', 'else', 'while', 'for', 'in',
  'def', 'return', 'break', 'continue', 'pass', 'and', 'or', 'not', 'True', 'False',
  'import', 'from', 'as', 'global']
  .map(word => [word, word.toUpperCase()]));

function tokenize(source) {
  const tokens = [];
  const indentation = [0];
  const brackets = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const add = (type, value, line, column) => tokens.push({ type, value, line, column });
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const number = index + 1;
    const leading = line.match(/^[ \t]*/)[0];
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (leading.includes('\t')) throw new Error(`Line ${number}: use spaces instead of tabs for indentation`);
    if (!brackets.length) {
      const width = leading.length;
      if (width > indentation.at(-1)) {
        indentation.push(width);
        add('INDENT', '', number, 0);
      } else {
        while (width < indentation.at(-1)) {
          indentation.pop();
          add('DEDENT', '', number, 0);
        }
        if (width !== indentation.at(-1)) throw new Error(`Line ${number}: indentation does not match an enclosing block`);
      }
    }
    let column = leading.length;
    while (column < line.length) {
      const rest = line.slice(column);
      if (/^[ \t]/.test(rest)) { column++; continue; }
      if (rest[0] === '#') break;
      if (rest[0] === '"' || rest[0] === "'") {
        const match = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
        if (!match) throw new Error(`Line ${number}, column ${column + 1}: unterminated string`);
        add('STRING', match[0], number, column);
        column += match[0].length;
        continue;
      }
      const name = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (name) {
        add(keywords.get(name[0]) || 'NAME', name[0], number, column);
        column += name[0].length;
        continue;
      }
      const numberToken = rest.match(/^[0-9]+(?:\.[0-9]+)?/);
      if (numberToken) {
        add(numberToken[0].includes('.') ? 'DECIMAL' : 'NUMBER', numberToken[0], number, column);
        column += numberToken[0].length;
        continue;
      }
      const op = rest.match(/^(\/\/=|[+/*%&|^-]=|==|!=|<=|>=|\/\/|[()[\]=,:./+*%&|^~<>-])/);
      if (!op) throw new Error(`Line ${number}, column ${column + 1}: unsupported character ${JSON.stringify(rest[0])}`);
      const value = op[0];
      if (value === '(' || value === '[') brackets.push(value);
      if (value === ')' || value === ']') {
        const expected = value === ')' ? '(' : '[';
        if (brackets.pop() !== expected) throw new Error(`Line ${number}: unmatched closing ${value === ')' ? 'parenthesis' : 'bracket'}`);
      }
      const type = /^(==|!=|<=|>=|<|>)$/.test(value) ? 'COMPARE'
        : value === '//' ? 'FLOORDIV' : value.length > 1 && value.endsWith('=') ? 'AUGMENT' : value;
      add(type, value, number, column);
      column += value.length;
    }
    if (!brackets.length) add('NEWLINE', '\n', number, line.length);
  }
  if (brackets.length) throw new Error(`Unclosed ${brackets.at(-1) === '(' ? 'parenthesis' : 'bracket'} at end of source`);
  while (indentation.length > 1) {
    indentation.pop();
    add('DEDENT', '', lines.length, 0);
  }
  add('EOF', '', lines.length, 0);
  return tokens;
}

class Lexer {
  setInput(source, yy) {
    this.tokens = tokenize(source);
    this.index = 0;
    this.yy = yy;
    this.yylloc = { first_line: 1, last_line: 1, first_column: 0, last_column: 0 };
    return this;
  }
  lex() {
    const token = this.tokens[this.index++];
    if (!token) return 1;
    this.yytext = token.value;
    this.yyleng = token.value.length;
    this.yylineno = token.line - 1;
    this.yylloc = { first_line: token.line, last_line: token.line,
      first_column: token.column, last_column: token.column + token.value.length };
    return token.type;
  }
  showPosition() { return `Line ${this.yylloc.first_line}, column ${this.yylloc.first_column + 1}`; }
}

module.exports = { Lexer, tokenize };
