'use strict';
const { parse } = require('./parser');
const fail = (node, message, hint) => {
  const error = new Error(`${node.filename || '<source>'}: Line ${node.line}: ${message}`);
  error.hint = hint;
  throw error;
};
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(item => walk(item, visit));
  visit(value);
  Object.values(value).forEach(child => { if (child && typeof child === 'object') walk(child, visit); });
}
function literal(node) {
  if (node.type === 'number' || node.type === 'boolean' || node.type === 'decimal') return Number(node.value);
  if (node.type === 'call' && node.name === 'fixed' && node.args.length === 1) return literal(node.args[0]);
  if (node.type === 'unary' && node.op === '-') return -literal(node.expression);
  if (node.type === 'binary') {
    const a = literal(node.left), b = literal(node.right);
    if ((node.op === '//' || node.op === '%') && b === 0) fail(node, 'Constant division by zero');
    const ops = { '+': () => a + b, '-': () => a - b, '*': () => a * b, '//': () => Math.floor(a / b), '%': () => a - Math.floor(a / b) * b, '&': () => a & b, '|': () => a | b, '^': () => a ^ b };
    if (ops[node.op]) return ops[node.op]();
  }
  fail(node, 'Constants and defaults require compile-time integer expressions');
}
const helperSources = {
  abs: 'def abs(value):\n    if value < 0:\n        return -value\n    return value\n',
  min: 'def min(a, b):\n    if a < b:\n        return a\n    return b\n',
  max: 'def max(a, b):\n    if a > b:\n        return a\n    return b\n',
  clamp: 'def clamp(value, low, high):\n    if low > high:\n        return 0\n    if value < low:\n        return low\n    if value > high:\n        return high\n    return value\n'
};
for (const axis of ['x', 'y']) {
  const pos = axis === 'x' ? 'x' : 'y';
  helperSources[`move_${axis}`] = `def move_${axis}(board, x, y, width, height, delta):
    if rect_is_solid(board, x, y, width, height):
        return ${pos}
    while delta != 0:
        step = 1
        if delta < 0:
            step = -1
        if step > 0 and ${pos} == 32767 or step < 0 and ${pos} == -32768:
            return ${pos}
        next_position = ${pos} + step
        if rect_is_solid(board, ${axis === 'x' ? 'next_position, y' : 'x, next_position'}, width, height):
            return ${pos}
        ${pos} = next_position
        delta -= step
    return ${pos}
`;
}
function prepare(ast) {
  walk(ast, node => require('./builtin-arguments').normalize(node, fail));
  const constants = new Map();
  const declarations = new Set();
  const reserved = new Set([...require('./codegen').reservedNames, ...Object.keys(helperSources), ...ast.filter(node => node.type === 'function').map(node => node.name)]);
  for (const node of ast) if (node.type === 'assign' && node.expression.type === 'call' && node.expression.name === 'constant') {
    if (node.op || node.expression.args.length !== 1 || constants.has(node.name) || reserved.has(node.name)) fail(node, 'constant() requires one expression and a unique non-reserved top-level declaration');
    walk(node.expression.args[0], value => { if (value.type === 'name' && constants.has(value.name)) { value.type = 'number'; value.value = constants.get(value.name); delete value.name; } });
    const value = literal(node.expression.args[0]);
    if (!Number.isInteger(value) || value < -32768 || value > 32767) fail(node, 'Constant must fit signed 16-bit values');
    constants.set(node.name, value); declarations.add(node);
  }
  ast = ast.filter(node => !declarations.has(node));
  walk(ast, node => {
    if (node.type === 'global') node.names = node.names.filter(name => !constants.has(name));
    if ((node.type === 'assign' || node.type === 'for') && constants.has(node.name)) fail(node, 'Cannot assign to a constant');
    if (node.type === 'function' && node.params.some(name => constants.has(name))) fail(node, 'Parameters cannot shadow constants');
    if (node.type === 'name' && constants.has(node.name)) { node.type = 'number'; node.value = constants.get(node.name); delete node.name; }
    if (node.type === 'call' && node.name === 'constant') fail(node, 'constant() requires a top-level declaration');
  });
  const needed = new Set();
  walk(ast, node => { if (node.type === 'call' && Object.hasOwn(helperSources, node.name)) needed.add(node.name); });
  for (const name of needed) {
    if (ast.some(node => node.type === 'function' && node.name === name)) fail(ast.find(node => node.name === name), 'Reserved helper name');
    const helper = parse(helperSources[name])[0];
    helper.publicParams = [...helper.params];
    const locals = new Set(helper.params);
    walk(helper.body, node => { if (node.type === 'assign' || node.type === 'for') locals.add(node.name); });
    const rename = value => `__pyson_${name}_${value}`;
    helper.params = helper.params.map(rename);
    walk(helper.body, node => { if (locals.has(node.name)) node.name = rename(node.name); });
    walk(helper, node => { if (node.type) Object.defineProperty(node, 'filename', { value: `<Pyson ${name}>`, enumerable: false }); });
    ast.push(helper);
  }
  const functions = new Map(ast.filter(node => node.type === 'function').map(node => [node.name, node]));
  for (const fn of functions.values()) {
    let optional = false;
    fn.defaults = (fn.defaults || fn.params.map(() => null)).map(value => {
      if (!value) { if (optional) fail(fn, 'Required parameters must precede defaults'); return null; }
      optional = true;
      const number = literal(value);
      let fractional = false;
      walk(value, node => { if (node.type === 'decimal' || node.type === 'call' && node.name === 'fixed') fractional = true; });
      if (fractional) {
        const encoded = Math.sign(number) * Math.round(Math.abs(number) * 16);
        if (!Number.isFinite(encoded) || encoded < -32768 || encoded > 32767) fail(value, 'Fixed-point default must fit -2048..2047.9375');
        return { type: 'decimal', value: encoded / 16, line: value.line };
      }
      if (!Number.isInteger(number) || number < -32768 || number > 32767) fail(value, 'Default must fit signed 16-bit values');
      return { type: 'number', value: number, line: value.line };
    });
  }
  walk(ast, node => {
    if (node.type !== 'call' || !functions.has(node.name)) return;
    const fn = functions.get(node.name), args = fn.params.map(() => null), order = [];
    let named = false;
    node.args.forEach((arg, index) => {
      if (arg.type !== 'keyword' && named) fail(arg, 'Positional arguments must precede keywords');
      const slot = arg.type === 'keyword' ? (fn.publicParams || fn.params).indexOf(arg.name) : index;
      named ||= arg.type === 'keyword';
      if (slot < 0 || slot >= args.length || args[slot]) fail(arg, 'Unknown, duplicate, or excess function argument/keyword');
      args[slot] = arg.type === 'keyword' ? arg.expression : arg; order.push(slot);
    });
    args.forEach((arg, index) => { if (!arg) { if (!fn.defaults[index]) fail(node, `${node.name} expects ${fn.params.length} arguments; missing "${fn.params[index]}"`); args[index] = { ...fn.defaults[index] }; order.push(index); } });
    node.args = args; node.argumentOrder = order;
  });
  return { ast, constants: Object.fromEntries(constants) };
}
module.exports = { prepare, literal };
