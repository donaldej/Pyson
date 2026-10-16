'use strict';

const fs = require('node:fs');
const path = require('node:path');
const font = require('./font');
const graphicsCodegen = require('./graphics-codegen');
const frameCodegen = require('./frame-codegen');
const soundCodegen = require('./sound-codegen');
const musicCodegen = require('./music-codegen');
const saveCodegen = require('./save-codegen');
const animationCodegen = require('./animation-codegen');
const { records } = require('./records');
const { analyzeArrayParameters } = require('./array-parameters');
const poolCodegen = require('./pools');
const dialogueCodegen = require('./dialogue-codegen');
const rectangleCodegen = require('./rectangle-codegen');
const randomCodegen = require('./random-codegen');
const formatCodegen = require('./format-codegen');
const { generateROM } = require('./rom-template');
const { bankFunctions } = require('./code-banking');
const root = path.resolve(__dirname, '..');
const buttons = { right: 1, left: 2, up: 4, down: 8, a: 16, b: 32, select: 64, start: 128 };
const constants = new Map(Object.entries(buttons).map(([name, value]) => [`BUTTON_${name.toUpperCase()}`, value]));
const builtins = new Set(['print', 'wait_vblank', 'read_buttons', 'button', 'button_pressed', 'range', 'len', ...graphicsCodegen.names, ...soundCodegen.names, ...musicCodegen.names, ...saveCodegen.names, ...animationCodegen.names]);
const fail = (node, message) => { throw new Error(`${node.filename ? node.filename + ': ' : ''}Line ${node.line}: ${message}`); };
builtins.add('record');
builtins.add('records');
builtins.add('constant_table');
builtins.add('fixed');
builtins.add('int');
builtins.add('rect_overlap');
builtins.add('format_text');
randomCodegen.names.forEach(name => builtins.add(name));
poolCodegen.names.forEach(name => builtins.add(name));
dialogueCodegen.names.forEach(name => builtins.add(name));
frameCodegen.names.forEach(name => builtins.add(name));
const db = bytes => `    db ${bytes.join(', ')}`;
const children = statement => statement.type === 'if'
  ? [...statement.branches.map(branch => branch.body), statement.otherwise]
  : statement.body ? [statement.body] : [];
function walk(statements, visit) {
  for (const statement of statements) {
    visit(statement);
    if (statement.type !== 'function') for (const body of children(statement)) walk(body, visit);
  }
}

function generate(ast, header, headerBytes, graphics, save, finalizeBanks) {
  const usesFrameClock = node => node && typeof node === 'object' &&
    ((node.type === 'call' && frameCodegen.names.includes(node.name)) || Object.values(node).some(usesFrameClock));
  graphics.frameClock = Boolean(usesFrameClock(ast) || graphics.clips?.enabled);
  graphics.paletteLiterals = [];
  const music = musicCodegen.collectMusic(ast);
  const sound = soundCodegen.collectSounds(ast);
  sound.enabled ||= music.enabled;
  const animation = animationCodegen.collectAnimations(ast, graphics);
  const dialogue = { enabled: false };
  const rectangle = { enabled: false };
  let serial = 0;
  const label = prefix => `L_${prefix}_${serial++}`;
  const functions = new Map();
  const strings = new Map();
  const arrayLiterals = [];
  const sourceLocations = [];
  let sourceDiagnostics = false;
  const symbols = [];
  const mainCalls = [];
  const main = { name: '$module', symbols: new Map(), required: new Set(), calls: new Set() };
  for (const node of ast.filter(node => node.type === 'function')) {
    if (functions.has(node.name) || builtins.has(node.name) || constants.has(node.name)) fail(node, `Duplicate or reserved function name "${node.name}"`);
    if (new Set(node.params).size !== node.params.length) fail(node, 'Duplicate function parameter');
    functions.set(node.name, { name: node.name, node, symbols: new Map(), required: new Set(), calls: new Set(), label: label('function') });
  }
  function declare(scope, name, node, type = null) {
    if (builtins.has(name) || constants.has(name) || functions.has(name)) fail(node, `Reserved variable name "${name}"`);
    if (!scope.symbols.has(name)) {
      const symbol = { name, label: label('variable'), type, scope: scope.name };
      scope.symbols.set(name, symbol);
      symbols.push(symbol);
    }
    const symbol = scope.symbols.get(name);
    if (type) {
      if (symbol.type && symbol.type !== type) fail(node, `Variable "${name}" must be ${type}`);
      symbol.type = type;
    }
    return symbol;
  }
  for (const scope of [main, ...functions.values()]) {
    const body = scope === main ? ast : scope.node.body;
    const shared = new Set();
    walk(body, node => {
      if (node.type === 'global') {
        if (scope === main) fail(node, 'global is supported only inside a function');
        node.names.forEach(name => shared.add(name));
      }
      if (scope !== main && ['assign', 'for'].includes(node.type) && node.name.includes('.')) shared.add(node.name);
    });
    for (const name of shared) {
      const symbol = main.symbols.get(name);
      if (!symbol) fail(scope.node, `Undefined global variable "${name}"`);
      scope.symbols.set(name, symbol);
    }
    if (scope !== main) for (const [i, param] of scope.node.params.entries()) declare(scope, param, scope.node, scope.node.defaults?.[i]?.type === 'decimal' ? 'fixed' : null);
    walk(body, node => {
      if (node.type === 'function' && scope !== main) fail(node, 'Nested function definitions are not supported');
      if (node.type === 'assign') declare(scope, node.name, node);
      if (node.type === 'for') declare(scope, node.name, node, node.iterable ? null : 'number');
    });
  }
  const lookup = (scope, name, node) => {
    const symbol = scope.symbols.get(name) || main.symbols.get(name);
    if (!symbol) fail(node, `Undefined variable "${name}"`);
    return symbol;
  };
  for (const table of graphics.tables || []) {
    Object.assign(main.symbols.get(table.name), { label: table.label, type: 'array', length: table.length, bytes: 0, storage: 'rom', readOnly: true, romBytes: table.bytes });
  }
  for (const scope of [main, ...functions.values()]) walk(scope === main ? ast : scope.node.body, node => {
    if (node.type !== 'assign' || node.expression.type !== 'list') return;
    if (scope !== main && scope.node.params.includes(node.name)) fail(node, 'Array parameters cannot be rebound; assign their elements instead');
    const symbol = scope.symbols.get(node.name);
    const length = node.expression.items.length;
    if (length > 1024) fail(node, 'Arrays support at most 1024 elements; total storage must fit available WRAM');
    if (symbol.length !== undefined && symbol.length !== length) fail(node, `Array "${node.name}" must retain its fixed length ${symbol.length}`);
    symbol.length = length;
    symbol.bytes = length * 2;
  });
  const record = records({ fail, literalNumber, functions });
  const pool = poolCodegen.pools({ fail, lookup, literalNumber, symbols, label, arrayLiterals });
  function typeOf(node, scope) {
    if (node.type === 'call' && node.name === 'constant_table') return 'array';
    const pooled = pool.type(node, scope, typeOf);
    if (pooled !== undefined) return pooled;
    const structured = record.type(node, scope, typeOf);
    if (structured !== undefined) return structured;
    switch (node.type) {
      case 'number': case 'boolean': return 'number';
      case 'decimal': return 'fixed';
      case 'string': return 'string';
      case 'list': return 'array';
      case 'index': return 'number';
      case 'name': return constants.has(node.name) ? 'number' : lookup(scope, node.name, node).type;
      case 'compare': return 'number';
      case 'unary': return node.op === 'not' ? 'number' : typeOf(node.expression, scope);
      case 'binary': {
        const left = typeOf(node.left, scope), right = typeOf(node.right, scope);
        return node.op === '//' && (left === 'fixed' || right === 'fixed') ? 'number'
          : left === 'fixed' || right === 'fixed' ? 'fixed' : left;
      }
      case 'call': return node.name === 'fixed' ? 'fixed' : node.name === 'int' ? 'number' : functions.has(node.name) ? functions.get(node.name).returnType || 'number' : node.name === 'format_text' ? 'string' : ['music_track', 'music_file'].includes(node.name) ? 'music' : node.name === 'sprite_animation' ? 'animation' : node.name === 'sound_effect' ? 'sound' : ['print', 'wait_vblank', ...frameCodegen.procedures, ...randomCodegen.procedures, ...dialogueCodegen.procedures, ...graphicsCodegen.procedures, ...soundCodegen.procedures, ...musicCodegen.procedures, ...saveCodegen.procedures, ...animationCodegen.procedures].includes(node.name) ? 'void' : 'number';
      default: fail(node, 'Unsupported expression');
    }
  }
  // Resolve fixed variable types before emitting function bodies or forward references.
  for (let iteration = 0; iteration <= symbols.length + functions.size; iteration++) {
    let changed = false;
    for (const scope of [main, ...functions.values()]) walk(scope === main ? ast : scope.node.body, node => {
      changed = record.calls(node, scope, typeOf) || changed;
      if (node.type === 'return' && typeOf(node.expression, scope) === 'fixed' && scope.returnType !== 'fixed') { scope.returnType = 'fixed'; changed = true; }
      if (node.type === 'for' && node.iterable) {
        const arrayType = typeOf(node.iterable, scope);
        if (arrayType) {
          const variable = scope.symbols.get(node.name);
          if (variable.arrayReference) fail(node, 'Array parameters cannot be rebound by iteration; use a separate loop variable');
          const type = pool.isPool(arrayType) ? `handle:${lookup(scope, node.iterable.name, node).label}` : record.isArray(arrayType) ? `record:${record.fields(arrayType).join(',')}` : 'number';
          if (variable.type && variable.type !== type) fail(node, 'Loop variable must retain its fixed type');
          if (record.isRecord(type) && variable.type && !variable.reference) fail(node, 'Record iteration requires a separate reference variable; an owning record cannot be reused as the loop variable');
          if (record.isRecord(type) && scope !== main && scope.node.params.includes(node.name)) fail(node, 'Record parameters cannot be rebound by iteration; use a separate loop variable');
          if (!variable.type) { variable.type = type; variable.reference = record.isRecord(type); changed = true; }
        }
      }
      if (node.type !== 'assign') return;
      const symbol = scope.symbols.get(node.name);
      const type = typeOf(node.expression, scope);
      if (!type) return;
      if (symbol.type === 'number' && type === 'fixed') { symbol.type = 'fixed'; changed = true; }
      if (symbol.type === 'fixed' && type === 'number') return;
      if (symbol.type && symbol.type !== type) fail(node, `Variable "${node.name}" cannot change from ${symbol.type} to ${type}`);
      if (!symbol.type) { symbol.type = type; changed = true; }
      record.layout(symbol, node);
      pool.layout(symbol, node);
    });
    if (!changed) break;
  }
  for (const symbol of symbols) if (!symbol.type) symbol.type = symbol.length !== undefined ? 'array' : 'number';
  for (const symbol of symbols) { record.layout(symbol); pool.layout(symbol); }
  analyzeArrayParameters({ ast, main, functions, lookup, fail });

  function stringLabel(value, node) {
    if (!strings.has(value)) {
      const tiles = [...value].map(c => {
        if (c === '\n') return 254;
        if (!font.ids.has(c)) fail(node, `Unsupported font character ${JSON.stringify(c)}`);
        return font.ids.get(c);
      });
      strings.set(value, { label: label('text'), tiles: [...tiles, 255] });
    }
    return strings.get(value).label;
  }
  function numeric(node, context) {
    if (typeOf(node, context.scope) !== 'number') fail(node, 'Expected an integer expression');
  }
  function arithmetic(node, context) {
    if (!['number', 'fixed'].includes(typeOf(node, context.scope))) fail(node, 'Expected an integer or fixed-point number');
  }
  function fixedLiteral(value, node) {
    const encoded = Math.sign(value) * Math.round(Math.abs(value) * 16);
    if (!Number.isFinite(encoded) || encoded < -32768 || encoded > 32767) fail(node, 'Fixed-point value must fit -2048..2047.9375');
    return [`    ld hl, ${encoded}`];
  }
  function asFixed(node, context) {
    arithmetic(node, context);
    if (typeOf(node, context.scope) === 'fixed') return expression(node, context);
    const literal = literalNumber(node);
    if (literal !== null) return fixedLiteral(literal, node);
    graphics.fixed = true;
    return [...expression(node, context), '    call FixedFromInt'];
  }
  function truth(type, node, scope) {
    if (pool.isHandle(type)) return ['    push hl', '    call PoolHandleValid', '    ld a, h', '    or l', '    pop hl'];
    if (type === 'array') {
      const symbol = lookup(scope, node.name, node);
      return symbol.arrayReference ? ['    push hl', ...arrayLength(symbol), '    ld a, h', '    or l', '    pop hl']
        : [`    ld a, ${symbol.length ? 1 : 0}`, '    and a'];
    }
    return type === 'string' ? ['    ld a, [hl]', '    inc a'] : ['    ld a, h', '    or l'];
  }
  function store(symbol) { return [`    ld a, l`, `    ld [${symbol.label}], a`, '    ld a, h', `    ld [${symbol.label} + 1], a`]; }
  function load(symbol) { return [`    ld a, [${symbol.label}]`, '    ld l, a', `    ld a, [${symbol.label} + 1]`, '    ld h, a']; }
  function arrayLength(symbol) { return symbol.arrayReference ? load({ label: `${symbol.label} + 2` }) : [`    ld hl, ${symbol.length}`]; }
  function arrayBase(symbol) { return symbol.arrayReference ? load(symbol) : [`    ld hl, ${symbol.label}`]; }
  function arrayBank(symbol) {
    return symbol.romReference ? load({ label: `${symbol.label} + 4` })
      : [`    ld hl, ${symbol.readOnly ? `BANK(${symbol.label})` : '$ffff'}`];
  }
  function literalNumber(node) {
    if (node.type === 'number') return node.value;
    if (node.type === 'boolean') return Number(node.value);
    if (node.type === 'unary' && ['+', '-'].includes(node.op)) {
      const value = literalNumber(node.expression);
      if (value !== null) return node.op === '-' ? -value : value;
    }
    return null;
  }
  function compare(op) {
    const yes = label('comparison_true');
    const done = label('comparison_done');
    const code = ['    call CompareSigned', '    ld hl, 0'];
    if (op === '==') code.push(`    jp z, ${yes}`);
    if (op === '!=') code.push(`    jp nz, ${yes}`);
    if (op === '<') code.push(`    jp c, ${yes}`);
    if (op === '<=') code.push(`    jp c, ${yes}`, `    jp z, ${yes}`);
    if (op === '>=') code.push(`    jp nc, ${yes}`);
    if (op === '>') code.push(`    jp z, ${done}`, `    jp nc, ${yes}`);
    code.push(`    jp ${done}`, `${yes}:`, '    ld hl, 1', `${done}:`);
    return code;
  }
  function binaryOperation(op, right) {
    const code = [];
    if (op === '+') code.push('    add hl, de');
    if (op === '-') code.push('    ld a, e', '    sub l', '    ld l, a', '    ld a, d', '    sbc h', '    ld h, a');
    if (op === '*') code.push('    call Mul16');
    if (['//', '%'].includes(op)) {
      if (literalNumber(right) === 0) fail(right, 'Division by zero');
      code.push(...errorSite(right), '    call Div16');
      if (op === '%') code.push('    ld a, [wRemainder]', '    ld l, a', '    ld a, [wRemainder + 1]', '    ld h, a');
    }
    const bitop = { '&': 'and', '|': 'or', '^': 'xor' }[op];
    if (bitop) code.push('    ld a, l', `    ${bitop} e`, '    ld l, a', '    ld a, h', `    ${bitop} d`, '    ld h, a');
    return code;
  }
  const readIndirect = () => ['    ld a, [hli]', '    ld h, [hl]', '    ld l, a'];
  const writeIndirect = () => ['    ld a, l', '    ld [de], a', '    inc de', '    ld a, h', '    ld [de], a'];
  const readElement = symbol => symbol.romReference
    ? [`    ld a, [${symbol.label} + 4]`, '    ld c, a', `    ld a, [${symbol.label} + 5]`, '    ld b, a', '    call ReadArrayParameterWord'] : symbol.readOnly
    ? [`    ld bc, BANK(${symbol.label})`, '    call ReadConstantTableWord'] : readIndirect();
  function arraySymbol(node, context) {
    if (node.type !== 'name' || !(typeOf(node, context.scope) === 'array' || record.isArray(typeOf(node, context.scope)))) fail(node, 'Expected a named integer array or record array');
    return lookup(context.scope, node.name, node);
  }
  function indexAddress(node, context) {
    const symbol = arraySymbol(node.array, context);
    numeric(node.index, context);
    const value = literalNumber(node.index);
    if (symbol.length !== undefined && value !== null && (value < -symbol.length || value >= symbol.length)) fail(node, `Array index out of range for length ${symbol.length}`);
    return elementAddress(symbol, expression(node.index, context), expression(node.array, context), node);
  }
  function errorSite(node) {
    sourceDiagnostics = true;
    const location = `${path.basename(node.filename || '<source>')}:${node.line}`;
    const safe = [...location].map(char => font.ids.has(char) ? char : '?').join('');
    const pointer = stringLabel(safe, node);
    return ['    push hl', `    ld hl, ${pointer}`, '    ld a, l', '    ld [wErrorContext], a', '    ld a, h', '    ld [wErrorContext + 1], a', '    pop hl'];
  }
  function elementAddress(symbol, indexCode, baseCode = arrayBase(symbol), node = { line: 0, filename: '<generated>' }) {
    const length = symbol.arrayReference ? [`    ld a, [${symbol.label} + 2]`, '    ld e, a', `    ld a, [${symbol.label} + 3]`, '    ld d, a'] : [`    ld de, ${symbol.length}`];
    const code = [...baseCode, '    push hl', ...indexCode,
      '    pop bc', ...length, ...errorSite(node), '    call ArrayIndexAddress'];
    if (record.isArray(symbol.type)) {
      // ArrayIndexAddress normalizes and checks the index. Convert its word
      // offset into the larger record stride, retaining the checked base.
      code.push('    ld a, l', '    sub c', '    ld l, a', '    ld a, h', '    sbc b', '    ld h, a');
      const bits = (symbol.stride / 2).toString(2).slice(1);
      if (bits.includes('1')) code.push('    ld d, h', '    ld e, l');
      for (const bit of bits) {
        code.push('    add hl, hl');
        if (bit === '1') code.push('    add hl, de');
      }
      code.push('    add hl, bc');
    }
    return code;
  }
  function fieldAddress(node, context) {
    const type = typeOf(node.object, context.scope);
    if (pool.isHandle(type)) return [...errorSite(node), ...pool.fieldAddress(node, context, { expression, typeOf })];
    if (!record.isRecord(type)) fail(node, 'Field access requires a record; this local variable or array element has no record fields');
    const index = record.fields(type).indexOf(node.field);
    if (index < 0) fail(node, `Unknown record field "${node.field}"`);
    return [...expression(node.object, context), ...(index ? [`    ld de, ${index * 2}`, '    add hl, de'] : [])];
  }
  function initializeRecord(symbol, source, context) {
    if (symbol.reference) fail(source, 'Record parameters and loop references cannot be rebound; assign their fields instead');
    const fields = record.fields(symbol.type);
    const code = [];
    const destinations = [];
    function snapshot(item, offset) {
      if (typeOf(item, context.scope) !== `record:${fields.join(',')}`) fail(item, 'Record initializer must have the same fields');
      if (item.type === 'call' && item.name === 'record') {
        for (const arg of item.args) {
          numeric(arg.expression, context);
          code.push(...expression(arg.expression, context), '    push hl');
          destinations.push(offset + fields.indexOf(arg.name) * 2);
        }
      } else {
        // Evaluate an indexed source once and snapshot its values before writes.
        code.push(...expression(item, context));
        for (let i = 0; i < fields.length; i++) {
          code.push('    ld a, [hli]', '    ld e, a', '    ld a, [hli]', '    ld d, a', '    push de');
          destinations.push(offset + i * 2);
        }
      }
    }
    const repeated = record.isArray(symbol.type) && source.type === 'call' && source.name === 'records';
    const items = repeated ? [{ ...source, name: 'record', args: source.args.slice(1) }] : record.isArray(symbol.type) ? source.items : [source];
    if (!items) fail(source, 'Record arrays require records() or a list initializer');
    if (items.every(item => item.type === 'call' && item.name === 'record' && item.args.every(arg => literalNumber(arg.expression) !== null))) {
      const values = [];
      for (const item of items) {
        if (typeOf(item, context.scope) !== `record:${fields.join(',')}`) fail(item, 'Record initializer must have the same fields');
        for (const arg of item.args) { numeric(arg.expression, context); expression(arg.expression, context); }
        for (const field of fields) values.push(literalNumber(item.args.find(arg => arg.name === field).expression));
      }
      const bytes = values.flatMap(value => [value & 255, value >> 8 & 255]);
      const initial = label('record_initial');
      arrayLiterals.push({ label: initial, bytes: repeated ? Array.from({ length: symbol.length }, () => bytes).flat() : bytes });
      return [`    ld hl, ${initial}`, `    ld de, ${symbol.label}`, `    ld bc, ${symbol.bytes}`, '    call CopyArray'];
    }
    items.forEach((item, index) => snapshot(item, index * symbol.stride));
    for (const offset of destinations.reverse()) code.push('    pop hl', ...store({ label: `${symbol.label} + ${offset}` }));
    if (repeated && symbol.length > 1) {
      const next = label('record_fill');
      code.push(`    ld de, ${symbol.label} + ${symbol.stride}`, `    ld bc, ${symbol.length - 1}`, `${next}:`,
        '    push bc', `    ld hl, ${symbol.label}`, `    ld bc, ${symbol.stride}`, '    call CopyArray',
        '    pop bc', '    dec bc', '    ld a, b', '    or c', `    jp nz, ${next}`);
    }
    return code;
  }
  function expression(node, context) {
    const code = [];
    const scope = context.scope;
    switch (node.type) {
      case 'number':
        if (!Number.isInteger(node.value) || node.value < -32768 || node.value > 32767) fail(node, 'Integer literals must fit signed 16-bit values (-32768..32767)');
        return [`    ld hl, ${node.value}`];
      case 'boolean': return [`    ld hl, ${Number(node.value)}`];
      case 'decimal': return fixedLiteral(node.value, node);
      case 'string': return [`    ld hl, ${stringLabel(node.value, node)}`];
      case 'name': {
        if (constants.has(node.name)) return [`    ld hl, ${constants.get(node.name)}`];
        const symbol = lookup(scope, node.name, node);
        if (symbol.scope === scope.name && !context.assigned.has(node.name)) fail(node, `Variable "${node.name}" may be used before assignment`);
        if (symbol.scope !== scope.name) scope.required.add(node.name);
        if (symbol.arrayReference) return load(symbol);
        return pool.isPool(symbol.type) || pool.isHandle(symbol.type) || symbol.type === 'array' || record.isArray(symbol.type) || (record.isRecord(symbol.type) && !symbol.reference) ? [`    ld hl, ${symbol.label}`] : load(symbol);
      }
      case 'list': fail(node, 'List literals are supported only as named array assignments'); break;
      case 'index': return [...indexAddress(node, context), ...(record.isRecord(typeOf(node, scope)) ? [] : readElement(arraySymbol(node.array, context)))];
      case 'field': return [...fieldAddress(node, context), ...readIndirect()];
      case 'unary': {
        if (node.expression.type === 'decimal' && ['+', '-'].includes(node.op)) return fixedLiteral(node.op === '-' ? -node.expression.value : node.expression.value, node);
        if (node.op === '-' && node.expression.type === 'number' && node.expression.value === 32768) return ['    ld hl, $8000'];
        code.push(...expression(node.expression, context));
        if (node.op === 'not') {
          if (typeOf(node.expression, scope) === 'void') fail(node, 'A procedure cannot be used as a condition');
          const done = label('not');
          code.push(...truth(typeOf(node.expression, scope), node.expression, scope), '    ld hl, 0', `    jp nz, ${done}`, '    inc hl', `${done}:`);
        } else {
          arithmetic(node.expression, context);
          if (node.op === '~' && typeOf(node.expression, scope) === 'fixed') fail(node, 'Bitwise operations require integers; use int(value) first');
          if (node.op === '-') code.push('    call NegHL');
          if (node.op === '~') code.push('    ld a, h', '    cpl', '    ld h, a', '    ld a, l', '    cpl', '    ld l, a');
        }
        return code;
      }
      case 'binary': {
        const leftType = typeOf(node.left, scope);
        const rightType = typeOf(node.right, scope);
        if (['and', 'or'].includes(node.op)) {
          if (leftType !== rightType || leftType === 'void' || leftType === 'array') fail(node, 'and/or operands must have the same fixed scalar type; use len(array) for array conditions');
          const done = label('short_circuit');
          return [...expression(node.left, context), ...truth(leftType), `    jp ${node.op === 'and' ? 'z' : 'nz'}, ${done}`, ...expression(node.right, context), `${done}:`];
        }
        arithmetic(node.left, context);
        arithmetic(node.right, context);
        const fractional = leftType === 'fixed' || rightType === 'fixed';
        if (fractional && ['&', '|', '^'].includes(node.op)) fail(node, 'Bitwise operations require integers; use int(value) first');
        if (!fractional && node.op === '/') fail(node, 'Use fixed(value) for fractional division, or // for integer division');
        const emit = fractional ? asFixed : expression;
        code.push(...emit(node.left, context), '    push hl', ...emit(node.right, context), '    pop de');
        if (fractional && ['*', '/'].includes(node.op)) {
          graphics.fixed = true;
          if (node.op === '/') {
            if (literalNumber(node.right) === 0 || node.right.type === 'decimal' && Math.round(node.right.value * 16) === 0) fail(node, 'Division by zero');
            code.push(...errorSite(node));
          }
          code.push(`    call ${node.op === '*' ? 'FixedMul' : 'FixedDiv'}`);
        } else code.push(...binaryOperation(node.op, node.right));
        return code;
      }
      case 'compare': {
        arithmetic(node.first, context);
        const no = label('chain_false');
        const done = label('chain_done');
        code.push(...expression(node.first, context));
        for (const item of node.rest) {
          arithmetic(item.expression, context);
          const leftNode = item === node.rest[0] ? node.first : node.rest[node.rest.indexOf(item) - 1].expression;
          const fractional = typeOf(leftNode, scope) === 'fixed' || typeOf(item.expression, scope) === 'fixed';
          if (fractional && typeOf(leftNode, scope) !== 'fixed') {
            const value = literalNumber(leftNode);
            if (value !== null) fixedLiteral(value, leftNode);
            code.push('    call FixedFromInt');
          }
          if (fractional) graphics.fixed = true;
          code.push('    push hl', ...(fractional ? asFixed(item.expression, context) : expression(item.expression, context)), '    pop de', '    push hl', ...compare(item.op), ...truth('number'), `    jp z, ${no}`, '    pop hl');
          if (fractional && typeOf(item.expression, scope) !== 'fixed') code.push('    call FixedToInt');
        }
        code.push('    ld hl, 1', `    jp ${done}`, `${no}:`, '    pop hl', '    ld hl, 0', `${done}:`);
        return code;
      }
      case 'call': {
        if (['fixed', 'int'].includes(node.name)) {
          if (node.args.length !== 1) fail(node, `${node.name} expects one numeric value`);
          arithmetic(node.args[0], context);
          if (node.name === 'fixed') return asFixed(node.args[0], context);
          const result = expression(node.args[0], context);
          if (typeOf(node.args[0], scope) === 'fixed') { graphics.fixed = true; result.push('    call FixedToInt'); }
          return result;
        }
        const formatCall = formatCodegen.emitFormat(node, context, { fail, numeric, expression, label }, graphics);
        if (formatCall) return formatCall;
        const randomCall = randomCodegen.emitRandom(node, context, { fail, expression, numeric, literalNumber }, graphics);
        if (randomCall) return randomCall;
        const rectangleCall = rectangleCodegen.emitRectangle(node, context, { fail, numeric, expression }, rectangle);
        if (rectangleCall) return rectangleCall;
        const dialogueCall = dialogueCodegen.emitDialogue(node, context, { fail, expression, numeric, literalNumber, typeOf, label, stringLabel }, dialogue, graphics);
        if (dialogueCall) return dialogueCall;
        const pooled = pool.emit(node, context, { expression, numeric, typeOf, store, load });
        if (pooled) return pooled;
        if (['record', 'records'].includes(node.name)) fail(node, 'Record constructors are supported in initialization assignments; pass a named record or array element to a helper');
        if (!['tile', 'music_track', 'worldmap'].includes(node.name) && node.args.some(arg => arg.type === 'keyword')) fail(node, `${node.name} does not accept named arguments here`);
        if (node.name === 'len') {
          if (node.args.length !== 1) fail(node, 'len expects one named array');
          if (pool.isPool(typeOf(node.args[0], scope))) {
            const owner = pool.owner(node.args[0], scope, typeOf);
            return [...expression(node.args[0], context), `    ld hl, ${owner.length}`];
          }
          const symbol = arraySymbol(node.args[0], context);
          return [...expression(node.args[0], context), ...arrayLength(symbol)];
        }
        const frameCall = frameCodegen.emitFrame(node, context, { fail, expression, numeric, literalNumber }, graphics);
        if (frameCall) return frameCall;
        const animationCall = animationCodegen.emitAnimation(node, context, { fail, expression, numeric, literalNumber, typeOf }, animation, graphics);
        if (animationCall) return animationCall;
        const saveCall = saveCodegen.emitSave(node, context, { fail, expression, numeric, literalNumber }, save);
        if (saveCall) return saveCall;
        const musicCall = musicCodegen.emitMusic(node, context, { fail, expression, numeric, literalNumber, typeOf, frameClock: graphics.frameClock }, music);
        if (musicCall) return musicCall;
        const soundCall = soundCodegen.emitSound(node, context, { fail, expression, numeric, literalNumber, typeOf, label, frameClock: graphics.frameClock }, sound);
        if (soundCall) return soundCall;
        const graphicsCall = graphicsCodegen.emitGraphics(node, context, { fail, expression, numeric, literalNumber, label, arraySymbol, arrayLength, arrayBank }, graphics);
        if (graphicsCall) return graphicsCall;
        if (node.name === 'range') fail(node, 'range() is supported only in for loops');
        if (['print', 'print_window'].includes(node.name)) {
          if (node.args.length < 3 || node.args.length > 4) fail(node, 'print expects (text_or_number, x, y[, palette])');
          const [value, x, y] = node.args;
          if (!['number', 'string'].includes(typeOf(value, scope))) fail(node, 'print expects a string or integer');
          numeric(x, context); numeric(y, context);
          for (const [arg, limit] of [[x, 19], [y, 17]]) {
            const literal = literalNumber(arg);
            if (literal !== null && (literal < 0 || literal > limit)) fail(arg, 'print coordinates must be x=0..19, y=0..17');
          }
          const done = label('print_done');
          const palette = node.args[3] || { type: 'number', value: 0, line: node.line };
          numeric(palette, context);
          const paletteValue = literalNumber(palette);
          if (paletteValue !== null && (paletteValue < 0 || paletteValue > 7)) fail(node, 'print palette must be 0..7');
          const invalidPalette = label('invalid_palette');
          const paletteReady = label('palette_ready');
          const args = [value, x, y, palette];
          const { reordered, evaluateArguments } = require('./builtin-arguments');
          const evaluation = reordered(node, args) ? [...evaluateArguments(node, args, context, expression), '    pop hl']
            : [...expression(value, context), '    push hl', ...expression(x, context), '    push hl', ...expression(y, context), '    push hl', ...expression(palette, context)];
          code.push(...evaluation,
            '    ld a, h', '    and a', `    jp nz, ${invalidPalette}`, '    ld a, l', '    cp 8', `    jp c, ${paletteReady}`, `${invalidPalette}:`, '    ld a, 255', `${paletteReady}:`,
            '    ld [wTextPalette], a', '    pop bc', '    pop de', '    pop hl', '    ld a, [wTextPalette]', '    cp 8', `    jp nc, ${done}`,
            '    ld a, b', '    or d', `    jp nz, ${done}`, '    ld a, c', '    cp 18', `    jp nc, ${done}`, '    ld a, e', '    cp 20', `    jp nc, ${done}`, '    ld b, e',
            ...(node.name === 'print_window' ? ['    ld a, 1', '    ld [wWindowText], a'] : []),
            `    call ${typeOf(value, scope) === 'string' ? 'PrintAt' : 'PrintNumber'}`,
            ...(node.name === 'print_window' ? ['    xor a', '    ld [wWindowText], a'] : []), `${done}:`, '    ld hl, 0');
          return code;
        }
        if (node.name === 'wait_vblank' || node.name === 'read_buttons') {
          if (node.args.length) fail(node, `${node.name} expects no arguments`);
          if (node.name === 'wait_vblank') code.push('    call WaitVBlank');
          code.push('    call PollButtons', '    ld h, 0', '    ld a, [wButtonsHeld]', '    ld l, a');
          return code;
        }
        if (['button', 'button_pressed'].includes(node.name)) {
          const arg = node.args[0];
          if (node.args.length !== 1 || arg.type !== 'string' || !buttons[arg.value.toLowerCase()]) fail(node, `${node.name} expects a literal button name: right, left, up, down, a, b, select, start`);
          const done = label('button');
          return [`    ld a, [${node.name === 'button' ? 'wButtonsHeld' : 'wButtonsPressed'}]`, `    and ${buttons[arg.value.toLowerCase()]}`, '    ld hl, 0', `    jp z, ${done}`, '    inc hl', `${done}:`];
        }
        const fn = functions.get(node.name);
        if (!fn) fail(node, `Unknown function "${node.name}"`);
        if (node.args.length !== fn.node.params.length) fail(node, `${node.name} expects ${fn.node.params.length} arguments`);
        // Evaluate every argument before overwriting the callee's static parameters.
        const argumentOrder = node.argumentOrder || node.args.map((_, i) => i);
        for (const i of argumentOrder) {
          const arg = node.args[i];
          const param = fn.symbols.get(fn.node.params[i]);
          if (param.arrayReference) {
            const array = arraySymbol(arg, context);
            if (array.type !== 'array') fail(arg, 'Array parameters require a named integer array or constant table');
            code.push(...expression(arg, context), '    push hl', ...arrayLength(array), '    push hl');
            if (param.romReference) code.push(...arrayBank(array), '    push hl');
            continue;
          } else if (pool.isHandle(param.type)) {
            if (typeOf(arg, scope) !== param.type) fail(arg, 'Pool handle parameter must refer to the same pool');
          } else if (record.isRecord(param.type)) {
            if (typeOf(arg, scope) !== param.type) fail(arg, 'Record argument must have the same fields as the parameter');
          } else if (param.type === 'fixed') {
            code.push(...asFixed(arg, context), '    push hl');
            continue;
          } else if (param.type === 'string') {
            if (typeOf(arg, scope) !== 'string') fail(arg, 'Expected a string expression');
          } else numeric(arg, context);
          code.push(...expression(arg, context), '    push hl');
        }
        for (const index of [...argumentOrder].reverse()) {
          const param = fn.node.params[index];
          const symbol = fn.symbols.get(param);
          if (symbol.romReference) code.push('    pop hl', ...store({ label: `${symbol.label} + 4` }));
          if (symbol.arrayReference) code.push('    pop hl', ...store({ label: `${symbol.label} + 2` }));
          code.push('    pop hl', ...(pool.isHandle(symbol.type) ? pool.copy(symbol.label) : store(symbol)));
        }
        code.push(`    ld bc, BANK(${fn.label})`, `    ld hl, ${fn.label}`, '    call CallBankedFunction');
        if (scope === main) mainCalls.push({ fn, assigned: new Set(context.assigned), node });
        else scope.calls.add(fn.name);
        return code;
      }
      default: fail(node, 'Unsupported expression');
    }
  }
  function statements(body, context) {
    const code = [];
    for (const node of body) {
      const sourceLabel = label('source');
      sourceLocations.push({ label: sourceLabel, filename: node.filename || '<source>', line: node.line, scope: context.scope.name });
      code.push(`${sourceLabel}:`, `; Source ${node.filename || '<source>'} line ${node.line}`);
      if (node.type === 'header') {
        if (context.scope !== main || context.nested) fail(node, 'Header assignments must be at the top level');
      } else if (node.type === 'function') {
        if (context.scope !== main || context.nested) fail(node, 'Functions must be defined at the top level');
      } else if (node.type === 'assign') {
        const symbol = context.scope.symbols.get(node.name);
        if (symbol.type === 'music' && !(node.expression.type === 'call' && ['music_track', 'music_file'].includes(node.expression.name))) fail(node, 'music_track bindings cannot be copied or reassigned');
        if (symbol.type === 'sound' && !(node.expression.type === 'call' && node.expression.name === 'sound_effect')) fail(node, 'sound_effect bindings cannot be copied or reassigned');
        if (symbol.type === 'animation' && !(node.expression.type === 'call' && node.expression.name === 'sprite_animation')) fail(node, 'sprite_animation bindings cannot be copied or reassigned');
        if (typeOf(node.expression, context.scope) === 'void') fail(node, 'Cannot assign the result of a procedure');
        if (pool.isPool(symbol.type)) {
          code.push(...pool.initialize(symbol, node, context, { expression, numeric }));
        } else if (pool.isHandle(symbol.type)) {
          code.push(...expression(node.expression, context), ...pool.copy(symbol.label));
        } else if (record.isRecord(symbol.type) || record.isArray(symbol.type)) {
          code.push(...initializeRecord(symbol, node.expression, context));
        } else if (symbol.type === 'array') {
          if (symbol.readOnly) { context.assigned.add(node.name); continue; }
          if (node.expression.type !== 'list') fail(node, 'Assign a list literal to initialize an array; array aliases and copies are not supported');
          const items = node.expression.items;
          const values = items.map(literalNumber);
          if (values.every(value => value !== null)) {
            // Constants become compact ROM data copied into the array when assigned.
            for (const item of items) { numeric(item, context); expression(item, context); }
            if (symbol.length) {
              const initial = label('array_initial');
              arrayLiterals.push({ label: initial, bytes: values.flatMap(value => [value & 255, value >> 8 & 255]) });
              code.push(`    ld hl, ${initial}`, `    ld de, ${symbol.label}`, `    ld bc, ${symbol.bytes}`, '    call CopyArray');
            }
          } else {
            // Evaluate the entire RHS before changing any element, including reinitialization.
            for (const item of items) { numeric(item, context); code.push(...expression(item, context), '    push hl'); }
            for (let i = symbol.length - 1; i >= 0; i--) code.push('    pop hl', ...store({ label: `${symbol.label} + ${i * 2}` }));
          }
        } else code.push(...(symbol.type === 'fixed' ? asFixed(node.expression, context) : expression(node.expression, context)), ...store(symbol));
        context.assigned.add(node.name);
      } else if (node.type === 'index_assign' && record.isRecord(typeOf(node.target, context.scope))) {
        if (node.op) fail(node, 'Whole-record augmented assignment is not supported');
        if (typeOf(node.expression, context.scope) !== typeOf(node.target, context.scope)) fail(node, 'Record assignment must retain the same fields');
        // Snapshot the RHS before evaluating the indexed target, as Python does.
        const fields = record.fields(typeOf(node.target, context.scope));
        if (node.expression.type === 'call') fail(node, 'Initialize array elements by setting fields or copying an existing record');
        code.push(...expression(node.expression, context));
        for (const field of fields) code.push('    ld a, [hli]', '    ld e, a', '    ld a, [hli]', '    ld d, a', '    push de');
        code.push(...indexAddress(node.target, context), `    ld de, ${(fields.length - 1) * 2}`, '    add hl, de');
        for (let i = fields.length - 1; i >= 0; i--) code.push('    pop de', '    ld [hl], e', '    inc hl', '    ld [hl], d', '    dec hl', '    dec hl', '    dec hl');
      } else if (node.type === 'index_assign' || node.type === 'field_assign') {
        numeric(node.expression, context);
        const address = node.type === 'field_assign' ? fieldAddress : indexAddress;
        if (node.op) {
          if (node.type === 'field_assign' && pool.isHandle(typeOf(node.target.object, context.scope))) {
            const saved = pool.temporary('augmented_handle');
            code.push(...pool.fieldAddress(node.target, context, { expression, typeOf }, saved.label), '    push hl', ...readIndirect(), '    push hl',
              ...expression(node.expression, context), '    pop de', ...binaryOperation(node.op, node.expression), '    push hl',
              `    ld hl, ${saved.label}`, '    call PoolResolve', '    pop hl', '    pop de', ...writeIndirect());
            continue;
          }
          // Augmented assignment evaluates its target once, before its RHS.
          code.push(...address(node.target, context), '    push hl', ...readIndirect(), '    push hl',
            ...expression(node.expression, context), '    pop de', ...binaryOperation(node.op, node.expression), '    pop de', ...writeIndirect());
        } else {
          // Python evaluates a plain assignment's RHS before the indexed target.
          code.push(...expression(node.expression, context), '    push hl', ...address(node.target, context),
            '    ld d, h', '    ld e, l', '    pop hl', ...writeIndirect());
        }
      } else if (node.type === 'expression') {
        if (node.expression.type !== 'call') fail(node, 'A standalone expression must be a function call');
        code.push(...expression(node.expression, context));
      } else if (node.type === 'pass' || node.type === 'global') {
        // Empty statement.
      } else if (node.type === 'return') {
        if (context.scope === main) fail(node, 'return is valid only inside a function');
        arithmetic(node.expression, context);
        code.push(...(context.scope.returnType === 'fixed' ? asFixed(node.expression, context) : expression(node.expression, context)), '    ret');
      } else if (node.type === 'break' || node.type === 'continue') {
        if (!context.loop) fail(node, `${node.type} is valid only inside a loop`);
        code.push(`    jp ${node.type === 'break' ? context.loop.end : context.loop.next}`);
      } else if (node.type === 'if') {
        const done = label('if_end');
        const assignedPaths = [];
        for (const branch of node.branches) {
          const next = label('if_next');
          if (typeOf(branch.condition, context.scope) === 'void') fail(branch.condition, 'A procedure cannot be used as a condition');
          code.push(...expression(branch.condition, context), ...truth(typeOf(branch.condition, context.scope), branch.condition, context.scope), `    jp z, ${next}`);
          const branchContext = { ...context, nested: true, assigned: new Set(context.assigned) };
          code.push(...statements(branch.body, branchContext), `    jp ${done}`, `${next}:`);
          assignedPaths.push(branchContext.assigned);
        }
        const elseContext = { ...context, nested: true, assigned: new Set(context.assigned) };
        code.push(...statements(node.otherwise, elseContext), `${done}:`);
        assignedPaths.push(elseContext.assigned);
        for (const name of assignedPaths[0]) if (assignedPaths.every(set => set.has(name))) context.assigned.add(name);
      } else if (node.type === 'while') {
        const next = label('while_next');
        const end = label('while_end');
        if (typeOf(node.condition, context.scope) === 'void') fail(node, 'A procedure cannot be used as a condition');
        code.push(`${next}:`, ...expression(node.condition, context), ...truth(typeOf(node.condition, context.scope), node.condition, context.scope), `    jp z, ${end}`,
          ...statements(node.body, { ...context, nested: true, assigned: new Set(context.assigned), loop: { next, end } }), `    jp ${next}`, `${end}:`);
      } else if (node.type === 'for') {
        if (node.iterable) {
          if (pool.isPool(typeOf(node.iterable, context.scope))) {
            code.push(...pool.iterate(node, context, { expression, typeOf, load, store, compare, truth }, statements));
            continue;
          }
          const array = arraySymbol(node.iterable, context);
          const variable = context.scope.symbols.get(node.name);
          const cursor = { label: label('array_cursor') };
          symbols.push(cursor);
          const check = label('array_for_check');
          const next = label('array_for_next');
          const end = label('array_for_end');
          const loopContext = { ...context, nested: true, assigned: new Set(context.assigned), loop: { next, end } };
          loopContext.assigned.add(node.name);
          code.push(...expression(node.iterable, context), '    ld hl, 0', ...store(cursor), `${check}:`,
            ...load(cursor), '    push hl', ...arrayLength(array), '    pop de', ...compare('<'), ...truth('number'), `    jp z, ${end}`,
            ...elementAddress(array, load(cursor), undefined, node),
            ...(record.isArray(array.type) ? [] : readElement(array)), ...store(variable),
            ...statements(node.body, loopContext), `${next}:`, ...load(cursor), '    inc hl', ...store(cursor), `    jp ${check}`, `${end}:`);
          continue;
        }
        if (node.iterator !== 'range' || node.args.length < 1 || node.args.length > 3) fail(node, 'for supports range(stop), range(start, stop), or range(start, stop, step)');
        const zero = { type: 'number', value: 0, line: node.line };
        const start = node.args.length === 1 ? zero : node.args[0];
        const stop = node.args.length === 1 ? node.args[0] : node.args[1];
        const step = node.args.length < 3 ? 1 : literalNumber(node.args[2]);
        if (step === null || step === 0 || step < -32768 || step > 32767) fail(node, 'range step must be a nonzero signed 16-bit integer literal');
        numeric(start, context); numeric(stop, context);
        const cursor = { label: label('range_cursor') };
        const limit = { label: label('range_stop') };
        const old = { label: label('range_old') };
        symbols.push(cursor, limit, old);
        const check = label('for_check');
        const next = label('for_next');
        const end = label('for_end');
        const variable = context.scope.symbols.get(node.name);
        if (variable.type !== 'number') fail(node, 'range loop variables must be integers; use a separate variable for fractional movement');
        code.push(...expression(start, context), ...store(cursor), ...expression(stop, context), ...store(limit), `${check}:`,
          ...load(cursor), '    push hl', ...load(limit), '    pop de', ...compare(step > 0 ? '<' : '>'), ...truth('number'), `    jp z, ${end}`,
          ...load(cursor), ...store(variable));
        const loopContext = { ...context, nested: true, assigned: new Set(context.assigned), loop: { next, end } };
        loopContext.assigned.add(node.name);
        code.push(...statements(node.body, loopContext), `${next}:`, ...load(cursor), ...store(old), `    ld de, ${step & 65535}`, '    add hl, de', ...store(cursor),
          '    push hl', ...load(old), '    pop de', ...compare(step > 0 ? '<' : '>'), ...truth('number'), `    jp nz, ${end}`, `    jp ${check}`, `${end}:`);
      } else fail(node, 'Unsupported statement');
    }
    return code;
  }

  const emittedFunctions = [];
  for (const fn of functions.values()) emittedFunctions.push({ name: fn.name, label: fn.label, filename: fn.node.filename || '<source>', line: fn.node.line,
    code: [`${fn.label}:`, ...statements(fn.node.body,
      { scope: fn, assigned: new Set(fn.node.params), nested: false, loop: null }), '    ld hl, 0', '    ret'] });
  const mainCode = statements(ast, { scope: main, assigned: new Set(), nested: false, loop: null });
  const visiting = new Set();
  const visited = new Set();
  function resolve(fn) {
    if (visiting.has(fn.name)) fail(fn.node, 'Recursive functions are not supported by the static local-variable runtime');
    if (visited.has(fn.name)) return;
    visiting.add(fn.name);
    for (const name of fn.calls) {
      const child = functions.get(name);
      resolve(child);
      for (const variable of child.required) fn.required.add(variable);
    }
    visiting.delete(fn.name);
    visited.add(fn.name);
  }
  for (const fn of functions.values()) resolve(fn);
  for (const call of mainCalls) for (const name of call.fn.required) if (!call.assigned.has(name)) fail(call.node, `Function "${call.fn.name}" reads global "${name}" before assignment`);

  if (graphics.clips?.enabled && (graphics.window || graphics.scrolling)) throw new Error('Background clips currently require a fixed background without window or world-camera routines');
  const codeBanking = bankFunctions(emittedFunctions);
  headerBytes = finalizeBanks(codeBanking.objects);
  const zeroError = stringLabel('Division by zero', { line: 0 });
  const indexError = stringLabel('Index out of range', { line: 0 });
  const poolError = pool.enabled ? stringLabel('Invalid pool handle', { line: 0 }) : null;
  const runtime = ['banking.asm', 'text.asm', 'frame-clock.asm', 'language.asm', 'graphics.asm', 'sprites.asm', 'arrays.asm', 'collision.asm', 'scrolling.asm', 'window.asm', ...(graphics.fixed ? ['fixed.asm'] : []), ...(graphics.random ? ['random.asm'] : []), ...(graphics.streaming ? ['streaming.asm', 'streaming-async.asm'] : [])].map(file => fs.readFileSync(path.join(root, 'include', file), 'utf8')).join('\n');
  const musicRuntime = (music.enabled ? fs.readFileSync(path.join(root, 'include', 'music.asm'), 'utf8') : '') + (music.waveEnabled ? '\n' + require('./wave-music').runtime(root) : '');
  const soundRuntime = sound.enabled ? fs.readFileSync(path.join(root, 'include', 'sound.asm'), 'utf8') : '';
  const saveRuntime = save.enabled ? fs.readFileSync(path.join(root, 'include', 'save.asm'), 'utf8') : '';
  const animationRuntime = animation.enabled ? fs.readFileSync(path.join(root, 'include', 'animation.asm'), 'utf8') : '';
  const poolRuntime = pool.enabled ? fs.readFileSync(path.join(root, 'include', 'pools.asm'), 'utf8') : '';
  const dialogueRuntime = dialogue.enabled ? fs.readFileSync(path.join(root, 'include', 'dialogue.asm'), 'utf8') : '';
  const choicesRuntime = dialogue.choicesEnabled ? fs.readFileSync(path.join(root, 'include', 'choices.asm'), 'utf8') : '';
  const rectangleRuntime = (rectangle.enabled ? fs.readFileSync(path.join(root, 'include', 'rectangles.asm'), 'utf8') : '')
    + '\n' + (graphics.format ? fs.readFileSync(path.join(root, 'include', 'format.asm'), 'utf8') : '')
    + '\n' + (dialogue.portraits ? fs.readFileSync(path.join(root, 'include', 'dialogue-portraits.asm'), 'utf8') : '')
    + '\n' + (graphics.terrainRectangles ? fs.readFileSync(path.join(root, 'include', 'terrain-rectangles.asm'), 'utf8') : '');
  graphics.sourceDiagnostics = sourceDiagnostics;
  const clipRuntime = fs.readFileSync(path.join(root, 'include', 'background-clips.asm'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'include', 'tile-grid.asm'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'include', 'tile-field.asm'), 'utf8');
  const assembly = generateROM({ rectangleEnabled: rectangle.enabled, rectangleRuntime, choicesEnabled: dialogue.choicesEnabled, choicesRuntime, choiceTables: dialogue.choiceTables || [], dialogueEnabled: dialogue.enabled, dialogueRuntime, poolEnabled: pool.enabled, poolRuntime, poolData: pool.data(), poolError, music, musicRuntime, animation, animationRuntime, save, saveRuntime, sound, soundRuntime, header, headerBytes, mainCode, codeBanking, runtime: runtime + '\n' + clipRuntime, strings, graphics, symbols, zeroError, indexError, arrayLiterals });
  return { assembly, sourceLocations, musicEnabled: music.enabled, music: [...music.used.values()].map(({ label, ...track }) => track), animationEnabled: animation.enabled, animations: [...animation.used.values()].map(({ label, ...definition }) => ({ ...definition })), soundEnabled: sound.enabled, sounds: [...sound.used.values()].map(({ bytes, label, ...effect }) => ({ ...effect, bytes: [...bytes] })), symbols: symbols.filter(symbol => symbol.name).map(symbol => ({ ...symbol })) };
}

module.exports = { generate, reservedNames: [...builtins, ...constants.keys()] };
