'use strict';

const names = ['pool', 'spawn', 'despawn', 'reset_pool', 'pool_count', 'pool_index'];
const isPool = type => typeof type === 'string' && type.startsWith('pool:');
const isHandle = type => typeof type === 'string' && type.startsWith('handle:');

function pools({ fail, lookup, literalNumber, symbols, label, arrayLiterals }) {
  const owners = new Map();
  let enabled = false;
  function definition(node) {
    const count = node.args[0] && literalNumber(node.args[0]);
    const args = node.args.slice(1);
    if (!Number.isInteger(count) || count < 1 || count > 128) fail(node, 'pool capacity must be a literal integer from 1 to 128');
    if (!args.length || args.length > 32 || args.some(arg => arg.type !== 'keyword' || literalNumber(arg.expression) === null)) fail(node, 'pool requires 1..32 named fields with literal integer or boolean defaults');
    if (new Set(args.map(arg => arg.name)).size !== args.length) fail(node, 'Duplicate pool field');
    return { count, fields: args.map(arg => arg.name).sort(), args };
  }
  function owner(node, scope, typeOf) {
    if (node.type !== 'name') fail(node, 'Expected a named pool');
    const type = typeOf(node, scope);
    if (!type) return null;
    if (!isPool(type)) fail(node, 'Expected a named pool');
    return lookup(scope, node.name, node);
  }
  function type(node, scope, typeOf) {
    if (node.type !== 'call') return undefined;
    if (node.name === 'pool') return `pool:${definition(node).fields.join(',')}`;
    if (node.name === 'spawn') {
      if (!node.args.length) fail(node, 'spawn expects a pool followed by optional named field overrides');
      const pool = owner(node.args[0], scope, typeOf);
      return pool ? `handle:${pool.label}` : null;
    }
    if (node.name === 'reset_pool') return 'void';
    return undefined;
  }
  function layout(symbol, node) {
    if (isHandle(symbol.type)) { symbol.bytes = 6; symbol.handle = true; return; }
    if (!isPool(symbol.type)) return;
    if (!node) return;
    if (node.expression.type !== 'call' || node.expression.name !== 'pool') fail(node, 'Pools cannot be copied or aliased');
    if (symbol.initializer && symbol.initializer !== node) fail(node, 'Pools are declared once; use reset_pool() to clear active objects');
    if (symbol.initializer) return;
    const spec = definition(node.expression);
    symbol.length = spec.count;
    symbol.fields = spec.fields.map((name, index) => ({ name, offset: 5 + index * 2, bytes: 2 }));
    symbol.stride = 5 + spec.fields.length * 2;
    symbol.bytes = symbol.stride * spec.count;
    symbol.metadataBytesPerSlot = 5;
    if (symbol.bytes > 4096) fail(node, 'Pool storage exceeds the 4096-byte WRAM budget; runtime buffers also need space');
    Object.defineProperty(symbol, 'initializer', { value: node });
    Object.defineProperty(symbol, 'descriptor', { value: label('pool_descriptor') });
    Object.defineProperty(symbol, 'defaults', { value: label('pool_defaults') });
    Object.defineProperty(symbol, 'defaultArgs', { value: spec.args });
    owners.set(symbol.label, symbol);
    enabled = true;
  }
  function handleOwner(type, node) {
    const pool = owners.get(type.slice(7));
    if (!pool) fail(node, 'Expected a pool handle');
    return pool;
  }
  function temporary(prefix, bytes = 6) {
    const symbol = { label: label(prefix), bytes };
    symbols.push(symbol);
    return symbol;
  }
  function copy(destination) { return [`    ld de, ${destination}`, '    ld bc, 6', '    call CopyArray']; }
  function initialize(symbol, node, context, api) {
    if (context.scope.name !== '$module' || context.nested) fail(node, 'Pools must be declared at module top level');
    for (const arg of symbol.defaultArgs) { api.numeric(arg.expression, context); api.expression(arg.expression, context); }
    const values = symbol.fields.map(field => literalNumber(symbol.defaultArgs.find(arg => arg.name === field.name).expression));
    arrayLiterals.push({ label: symbol.defaults, bytes: values.flatMap(value => [value & 255, value >> 8 & 255]) });
    return [`    ld hl, ${symbol.label}`, `    ld de, ${symbol.length}`, `    ld bc, ${symbol.stride}`, '    call PoolReset'];
  }
  function fieldAddress(node, context, api, snapshot) {
    const pool = handleOwner(api.typeOf(node.object, context.scope), node);
    const field = pool.fields.find(field => field.name === node.field);
    if (!field) fail(node, `Unknown pool field "${node.field}"`);
    return [...api.expression(node.object, context), ...(snapshot ? [...copy(snapshot), `    ld hl, ${snapshot}`] : []),
      '    call PoolResolve', ...(field.offset > 5 ? [`    ld de, ${field.offset - 5}`, '    add hl, de'] : [])];
  }
  function emit(node, context, api) {
    if (!names.includes(node.name)) return null;
    const { expression, numeric, typeOf } = api;
    if (node.name === 'pool') fail(node, 'pool() is supported only in top-level initialization assignments');
    if (['spawn', 'reset_pool', 'pool_count'].includes(node.name)) {
      if (!node.args.length) fail(node, `${node.name} expects a named pool`);
      const pool = owner(node.args[0], context.scope, typeOf);
      if (node.name !== 'spawn') {
        if (node.args.length !== 1) fail(node, `${node.name} expects one named pool`);
        return [...expression(node.args[0], context), `    ld de, ${pool.length}`, `    ld bc, ${pool.stride}`, `    call ${node.name === 'reset_pool' ? 'PoolReset' : 'PoolCount'}`];
      }
      const overrides = node.args.slice(1);
      if (overrides.some(arg => arg.type !== 'keyword')) fail(node, 'spawn overrides must be named fields');
      if (new Set(overrides.map(arg => arg.name)).size !== overrides.length) fail(node, 'Duplicate spawn field');
      const result = temporary('spawn_handle');
      const code = [...expression(node.args[0], context)]; // Definite initialization and global requirements.
      for (const arg of overrides) {
        if (!pool.fields.some(field => field.name === arg.name)) fail(arg, `Unknown pool field "${arg.name}"`);
        numeric(arg.expression, context);
        code.push(...expression(arg.expression, context), '    push hl');
      }
      code.push(`    ld hl, ${pool.descriptor}`, `    ld de, ${result.label}`, '    call PoolSpawn');
      for (const arg of [...overrides].reverse()) {
        const skip = label('spawn_override_skip');
        const offset = pool.fields.find(field => field.name === arg.name).offset - 5;
        code.push('    pop de', '    push de', `    ld hl, ${result.label}`, '    call PoolHandleValid', '    ld a, h', '    or l', `    jp z, ${skip}`,
          `    ld de, ${offset + 5}`, '    add hl, de', '    pop de', '    ld [hl], e', '    inc hl', '    ld [hl], d');
        const done = label('spawn_override_done');
        code.push(`    jp ${done}`, `${skip}:`, '    pop de', `${done}:`);
      }
      return [...code, `    ld hl, ${result.label}`];
    }
    if (node.args.length !== 1 || node.args[0].type === 'keyword' || !isHandle(typeOf(node.args[0], context.scope))) fail(node, `${node.name} expects one pool handle`);
    const pool = handleOwner(typeOf(node.args[0], context.scope), node);
    if (node.name === 'despawn') return [...expression(node.args[0], context), '    call PoolDespawn'];
    const invalid = label('pool_index_invalid');
    const done = label('pool_index_done');
    return [...expression(node.args[0], context), '    call PoolHandleValid', '    ld a, h', '    or l', `    jp z, ${invalid}`,
      `    ld bc, ${pool.label}`, '    ld a, l', '    sub c', '    ld l, a', '    ld a, h', '    sbc b', '    ld h, a',
      '    push hl', `    ld hl, ${pool.stride}`, '    pop de', '    call Div16', `    jp ${done}`, `${invalid}:`, '    ld hl, $ffff', `${done}:`];
  }
  function iterate(node, context, api, statements) {
    const { expression, load, store } = api;
    const pool = owner(node.iterable, context.scope, api.typeOf);
    const variable = context.scope.symbols.get(node.name);
    const cursor = temporary('pool_cursor', 2);
    const count = temporary('pool_iteration_count', 2);
    const check = label('pool_for_check');
    const next = label('pool_for_next');
    const end = label('pool_for_end');
    const loop = { ...context, nested: true, assigned: new Set([...context.assigned, node.name]), loop: { next, end } };
    return [...expression(node.iterable, context), ...store(cursor), `    ld hl, ${pool.length}`, ...store(count), `${check}:`,
      ...load(cursor), '    ld a, [hl]', '    and a', `    jp z, ${next}`, `    ld de, ${variable.label}`, '    call PoolCapture',
      ...statements(node.body, loop), `${next}:`, ...load(cursor), `    ld de, ${pool.stride}`, '    add hl, de', ...store(cursor),
      ...load(count), '    dec hl', ...store(count), '    ld a, h', '    or l', `    jp nz, ${check}`, `${end}:`];
  }
  function data() {
    return [...owners.values()].map(pool => `${pool.descriptor}:\n    dw ${pool.label}, ${pool.length}, ${pool.stride}, ${pool.defaults}, ${pool.stride - 5}`).join('\n');
  }
  return { isPool, isHandle, owner, type, layout, handleOwner, temporary, copy, initialize, fieldAddress, emit, iterate, data, get enabled() { return enabled; } };
}
module.exports = { pools, names, isPool, isHandle };
