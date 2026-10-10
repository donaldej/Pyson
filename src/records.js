'use strict';
const { isHandle } = require('./pools');

// Record schemas describe inline, fixed-size signed-word storage. References are
// restricted to parameters and loop variables; ordinary assignments copy values.
function records({ fail, literalNumber, functions }) {
  const isRecord = type => typeof type === 'string' && type.startsWith('record:');
  const isArray = type => typeof type === 'string' && type.startsWith('records:');
  const fields = type => type.slice(type.indexOf(':') + 1).split(',');
  function constructor(node) {
    const args = node.name === 'records' ? node.args.slice(1) : node.args;
    if (!args.length || args.length > 32 || args.some(arg => arg.type !== 'keyword')) fail(node, 'Records require 1..32 named integer fields');
    if (new Set(args.map(arg => arg.name)).size !== args.length) fail(node, 'Duplicate record field');
    if (node.name === 'records') {
      const count = node.args[0] && literalNumber(node.args[0]);
      if (!Number.isInteger(count) || count < 1 || count > 1024) fail(node, 'records count must be a literal integer from 1 to 1024');
    }
    return args.map(arg => arg.name).sort();
  }
  function type(node, scope, typeOf) {
    if (node.type === 'field') return 'number';
    if (node.type === 'call' && ['record', 'records'].includes(node.name)) return `${node.name}:${constructor(node).join(',')}`;
    if (node.type === 'index') {
      const array = typeOf(node.array, scope);
      if (!array) return null;
      return isArray(array) ? `record:${fields(array).join(',')}` : 'number';
    }
    if (node.type === 'list' && node.items.length) {
      const types = node.items.map(item => typeOf(item, scope));
      if (types.some(isRecord)) {
        if (types.some(type => !type)) return null;
        if (types.some(type => type !== types[0])) fail(node, 'Record array elements must have identical fields');
        return `records:${fields(types[0]).join(',')}`;
      }
      if (types.some(type => !type)) return null;
    }
    return undefined;
  }
  function calls(value, scope, typeOf) {
    let changed = false;
    if (!value || typeof value !== 'object') return false;
    // Exported helpers may be unused in this build. Array operations still give
    // their parameters a type, without requiring annotations or a dummy call.
    const arrayUse = value.type === 'index' ? value.array
      : value.type === 'for' ? value.iterable
      : value.type === 'call' && value.name === 'len' ? value.args[0] : null;
    if (arrayUse?.type === 'name' && scope.node?.params.includes(arrayUse.name)) {
      const param = scope.symbols.get(arrayUse.name);
      if (!param.type) { param.type = 'array'; param.arrayReference = true; param.bytes = 4; changed = true; }
    }
    if (value.type === 'call' && functions.has(value.name)) {
      const fn = functions.get(value.name);
      value.args.forEach((arg, index) => {
        if (arg.type === 'keyword') return; // prepare() binds user-function keywords before inference.
        const param = fn.symbols.get(fn.node.params[index]);
        if (!param) return;
        const actual = typeOf(arg, scope);
        const expected = actual === 'fixed' || actual === 'array' || actual === 'string' || isRecord(actual) || isHandle(actual) ? actual : 'number';
        if (!actual) return;
        if (expected === 'fixed' && param.type === 'number') { param.type = 'fixed'; changed = true; }
        if (expected === 'number' && param.type === 'fixed') return;
        if (param.type && param.type !== expected) fail(value, `Parameter "${param.name}" must retain the same record fields, integer type, string type, array type, or pool identity`);
        if (!param.type) {
          param.type = expected; param.reference = isRecord(expected);
          if (expected === 'array') { param.arrayReference = true; param.bytes = 4; }
          changed = true;
        }
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'branches') { for (const branch of child) changed = calls(branch.condition, scope, typeOf) || changed; continue; }
      if (key === 'body' || key === 'otherwise') continue;
      if (Array.isArray(child)) for (const item of child) changed = calls(item, scope, typeOf) || changed;
      else if (child && typeof child === 'object') changed = calls(child, scope, typeOf) || changed;
    }
    return changed;
  }
  function layout(symbol, node) {
    if (!isRecord(symbol.type) && !isArray(symbol.type)) return;
    symbol.fields = fields(symbol.type).map((name, index) => ({ name, offset: index * 2, bytes: 2 }));
    symbol.stride = symbol.fields.length * 2;
    if (isArray(symbol.type) && node) {
      const count = node.expression.type === 'list' ? node.expression.items.length : node.expression.name === 'records' ? literalNumber(node.expression.args[0]) : null;
      if (count === null) fail(node, 'Record arrays must be initialized with records() or a list of records');
      if (symbol.length !== undefined && symbol.length !== count) fail(node, 'Record arrays must retain their fixed length');
      symbol.length = count;
    }
    symbol.bytes = symbol.reference ? 2 : symbol.stride * (isArray(symbol.type) ? symbol.length : 1);
    if (symbol.bytes > 4096) fail(node, 'Record storage exceeds the 4096-byte WRAM budget; runtime buffers also need space');
  }
  return { isRecord, isArray, fields, type, calls, layout };
}
module.exports = { records };
