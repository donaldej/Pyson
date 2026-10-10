'use strict';

// Infer ROM-capable descriptors and writes through the complete helper graph.
// A write requirement travels toward callers; ROM capability travels toward callees.
function analyzeArrayParameters({ ast, main, functions, lookup, fail }) {
  const calls = [];
  function visit(node, scope) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(item => visit(item, scope)); return; }
    if (node.type === 'function') return;
    if (node.type === 'index_assign' && node.target.array?.type === 'name') {
      lookup(scope, node.target.array.name, node).arrayWrites = true;
    }
    if (node.type === 'call' && functions.has(node.name)) {
      const fn = functions.get(node.name);
      node.args.forEach((arg, i) => {
        const target = fn.symbols.get(fn.node.params[i]);
        if (target?.arrayReference && arg.type === 'name') {
          calls.push({ source: lookup(scope, arg.name, arg), target, node: arg });
        }
      });
    }
    Object.values(node).forEach(child => visit(child, scope));
  }
  visit(ast, main);
  for (const fn of functions.values()) visit(fn.node.body, fn);
  let changed;
  do {
    changed = false;
    for (const { source, target } of calls) {
      if ((source.readOnly || source.romReference) && !target.romReference) {
        target.romReference = true; target.bytes = 6; changed = true;
      }
      if (target.arrayWrites && !source.arrayWrites) { source.arrayWrites = true; changed = true; }
    }
  } while (changed);
  for (const { source, target, node } of calls) {
    if (source.readOnly && target.arrayWrites) fail(node, 'Cannot pass a read-only constant table to a helper that modifies its array parameter (including through other helpers)');
  }
}
module.exports = { analyzeArrayParameters };
