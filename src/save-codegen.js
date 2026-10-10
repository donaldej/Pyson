'use strict';
const { evaluateArguments } = require('./builtin-arguments');

const procedures = ['save_clear'];
const names = ['save_write', 'save_read', 'save_exists', 'save_delete', 'save_clear', 'save_capacity'];

function configureSave(ast, header, explicit) {
  let enabled = false;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'call' && names.includes(value.name)) enabled = true;
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  }
  visit(ast);
  if (!enabled) return { enabled: false, capacity: 0, ramBanks: 0 };
  if (!explicit.has('controller')) header.controller = header.rtc ? 'mbc3' : 'mbc5';
  if (!explicit.has('ram_kb')) header.ram_kb = 8;
  if (!explicit.has('battery')) header.battery = true;
  if (header.controller === 'rom_only' || !header.ram_kb || !header.battery) throw new Error('Save routines require an MBC1, MBC3, or MBC5 cartridge with RAM and battery=True');
  return { enabled: true, capacity: header.ram_kb * 128, ramBanks: header.ram_kb / 8, recordBytes: 8, formatVersion: 1 };
}

function emitSave(node, context, helpers, save) {
  if (!names.includes(node.name)) return null;
  const { fail, numeric, expression, literalNumber } = helpers;
  const counts = { save_write: [2, 2], save_read: [1, 2], save_exists: [1, 1], save_delete: [1, 1], save_clear: [0, 0], save_capacity: [0, 0] };
  const [min, max] = counts[node.name];
  if (node.args.length < min || node.args.length > max) fail(node, `${node.name} expects ${min === max ? min : `${min}..${max}`} arguments`);
  if (node.name === 'save_capacity') return [`    ld hl, ${save.capacity}`];
  const args = [...node.args];
  if (node.name === 'save_read' && args.length === 1) args.push({ type: 'number', value: 0, line: node.line });
  for (let i = 0; i < args.length; i++) {
    numeric(args[i], context);
    const value = literalNumber(args[i]);
    if (i === 0 && value !== null && (value < 0 || value >= save.capacity)) fail(args[i], `Save slot must be 0..${save.capacity - 1}`);
  }
  const code = evaluateArguments(node, args, context, expression);
  // Evaluate every argument before populating shared runtime argument slots.
  for (let i = args.length - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  const routines = { save_write: 'SaveWrite', save_read: 'SaveRead', save_exists: 'SaveExists', save_delete: 'SaveDelete', save_clear: 'SaveClear' };
  return [...code, `    call ${routines[node.name]}`];
}

module.exports = { names, procedures, configureSave, emitSave };
