'use strict';
const { literal } = require('./language-extensions');

// Tables are declarations, not runtime allocations. Each fits one ROM window.
function collectTables(ast) {
  const tables = [];
  const declarations = new Set();
  const calls = new Set();
  const fail = (node, message) => { throw new Error(`${node.filename || '<source>'}: Line ${node.line}: ${message}`); };
  for (const node of ast) {
    if (node.type !== 'assign' || node.expression.type !== 'call' || node.expression.name !== 'constant_table') continue;
    const call = node.expression;
    if (node.op || call.args.length !== 1 || call.args[0].type !== 'list') fail(node, 'constant_table() requires one list in a top-level declaration');
    if (tables.some(table => table.name === node.name)) fail(node, `Duplicate constant table "${node.name}"`);
    const values = call.args[0].items.map(item => {
      const value = literal(item);
      if (!Number.isInteger(value) || value < -32768 || value > 32767) fail(item, 'Constant table elements must fit signed 16-bit integers');
      return value;
    });
    if (values.length > 8191) fail(node, 'Constant tables support at most 8191 elements; split larger tables');
    tables.push({ name: node.name, label: `L_constant_table_${tables.length}`, kind: 'constant_table', length: values.length,
      bytes: Math.max(1, values.length * 2), data: values.flatMap(value => [value & 255, value >> 8 & 255]) });
    declarations.add(node);
    calls.add(call);
  }
  const names = new Set(tables.map(table => table.name));
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (value.type === 'call' && value.name === 'constant_table' && !calls.has(value)) fail(value, 'constant_table() requires a top-level declaration');
    if (['assign', 'for'].includes(value.type) && names.has(value.name) && !declarations.has(value)) fail(value, `Cannot reassign read-only constant table "${value.name}"`);
    if (value.type === 'function' && value.params.some(name => names.has(name))) fail(value, 'Parameters cannot shadow constant tables');
    if (value.type === 'index_assign' && value.target.array?.type === 'name' && names.has(value.target.array.name)) fail(value, 'Cannot modify a read-only constant table; use a normal list for mutable data');
    Object.values(value).forEach(visit);
  }
  visit(ast);
  return tables;
}
module.exports = { collectTables };
