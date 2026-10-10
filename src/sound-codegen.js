'use strict';
const { evaluateArguments, reordered } = require('./builtin-arguments');

const procedures = ['play_sound', 'stop_sound', 'set_sound_volume', 'mute_sound'];
const names = [...procedures, 'sound_effect', 'sound_playing'];
const presets = {
  menu_move: { channel: 'pulse', priority: 1, duty: 1, steps: [[660, 3, 8]] },
  menu_confirm: { channel: 'pulse', priority: 2, duty: 2, steps: [[660, 4, 10], [990, 6, 10]] },
  collect: { channel: 'pulse', priority: 3, duty: 2, steps: [[880, 4, 11], [1320, 7, 9]] },
  damage: { channel: 'noise', priority: 4, duty: 0, steps: [[0x34, 5, 12], [0x54, 7, 8], [0x64, 5, 4]] },
  win: { channel: 'pulse', priority: 6, duty: 2, steps: [[523, 7, 11], [659, 7, 11], [784, 7, 11], [1047, 16, 9]] },
  lose: { channel: 'pulse', priority: 5, duty: 2, steps: [[440, 9, 11], [330, 9, 9], [220, 16, 7]] }
};
const error = (node, message) => { throw new Error(`${node.filename ? node.filename + ': ' : ''}Line ${node.line}: ${message}`); };
const integer = (node, min, max, description) => {
  if (!node || node.type !== 'number' || !Number.isInteger(node.value) || node.value < min || node.value > max) error(node || { line: 0 }, `${description} must be a literal integer ${min}..${max}`);
  return node.value;
};
function encode(effect) {
  return [effect.channel === 'pulse' ? 0 : 1, effect.priority, effect.duty << 6, effect.steps.length,
    ...effect.steps.flatMap(([pitch, frames, volume]) => {
      const period = effect.channel === 'pulse' && pitch ? Math.max(0, Math.min(2047, 2048 - Math.round(131072 / pitch))) : pitch;
      return [frames, volume << 4, period & 255, period >> 8];
    })];
}
function collectSounds(ast) {
  const custom = new Map();
  const calls = new Map();
  const used = new Map();
  let enabled = false;
  function walk(value, visit, top = false) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(node => walk(node, visit, top)); return; }
    visit(value, top);
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, visit, false);
  }
  for (const node of ast) {
    walk(node, (value, top) => {
      if (value.type !== 'call' || value.name !== 'sound_effect') return;
      if (node.type !== 'assign' || node.expression !== value) error(value, 'sound_effect declarations must be top-level assignments');
      const args = value.args;
      if (args.length < 2 || args.length > 4 || args[0].type !== 'string' || !['pulse', 'noise'].includes(args[0].value) || args[1].type !== 'list') error(value, 'use sound_effect("pulse" or "noise", [[pitch, frames, volume], ...], [, priority[, duty]]) with literal arguments');
      const channel = args[0].value;
      if (args[1].items.length < 1 || args[1].items.length > 64) error(value, 'Sound effects require 1..64 steps');
      const steps = args[1].items.map(row => {
        if (row.type !== 'list' || row.items.length !== 3) error(row, 'Each sound step must be [pitch, frames, volume]');
        const pitch = integer(row.items[0], 0, channel === 'pulse' ? 20000 : 223, 'Sound pitch');
        if (channel === 'pulse' && pitch > 0 && pitch < 64) error(row.items[0], 'Pulse pitch must be 0 (rest) or 64..20000 Hz');
        const frames = integer(row.items[1], 1, 255, 'Sound step duration');
        let volume = integer(row.items[2], 0, 15, 'Sound step volume');
        if (channel === 'pulse' && pitch === 0) volume = 0;
        return [pitch, frames, volume];
      });
      const priority = args[2] ? integer(args[2], 0, 7, 'Sound priority') : 3;
      const duty = args[3] ? integer(args[3], 0, 3, 'Pulse duty') : 2;
      if (channel === 'noise' && args[3]) error(args[3], 'Noise effects do not accept a pulse duty argument');
      if (custom.has(node.name)) error(value, `Duplicate sound_effect declaration "${node.name}"`);
      const effect = { name: node.name, channel, steps, priority, duty: channel === 'pulse' ? duty : 0, label: `SoundCustom${custom.size}` };
      effect.bytes = encode(effect);
      custom.set(node.name, effect); calls.set(value, effect);
    }, true);
  }
  walk(ast, node => {
    if (node.type !== 'call') return;
    if (procedures.includes(node.name) || node.name === 'sound_playing') enabled = true;
    if (node.name !== 'play_sound') return;
    const arg = node.args[0];
    let effect;
    if (arg?.type === 'string') {
      const preset = presets[arg.value];
      if (!preset) error(node, `Unknown built-in sound "${arg.value}"; use ${Object.keys(presets).join(', ')}`);
      effect = { ...preset, name: arg.value, label: `Sound_${arg.value}`, bytes: encode(preset) };
    } else if (arg?.type === 'name') effect = custom.get(arg.name);
    if (!effect) error(node, 'play_sound requires a literal built-in name or a named sound_effect declaration');
    used.set(effect.label, effect); calls.set(node, effect);
  });
  return { custom, calls, used, enabled };
}
function emitSound(node, context, helpers, sound) {
  if (!names.includes(node.name)) return null;
  const { fail, expression, numeric, literalNumber, typeOf } = helpers;
  const sync = helpers.frameClock ? ['    call SyncFrameAudio'] : [];
  if (node.name === 'sound_effect') {
    const effect = sound.calls.get(node);
    if (!effect) fail(node, 'sound_effect declarations must be top-level assignments');
    return [`    ld hl, ${sound.used.has(effect.label) ? effect.label : 0}`];
  }
  if (node.name === 'sound_playing') {
    if (node.args.length) fail(node, 'sound_playing expects no arguments');
    return [...sync, '    ld a, [wSoundActive]', '    ld l, a', '    ld h, 0'];
  }
  if (node.name === 'play_sound') {
    if (node.args.length < 1 || node.args.length > 2) fail(node, 'play_sound expects (literal_name_or_effect[, priority])');
    const effect = sound.calls.get(node);
    let code = [];
    if (node.args[0].type === 'name') {
      if (typeOf(node.args[0], context.scope) !== 'sound') fail(node, 'play_sound expects a named sound_effect, not an integer or shadowing local');
    }
    const priority = node.args[1] || { type: 'number', value: effect.priority, line: node.line };
    numeric(priority, context);
    const value = literalNumber(priority);
    if (value !== null && (value < 0 || value > 7)) fail(node, 'Sound priority must be 0..7');
    const args = [node.args[0], priority];
    if (reordered(node, args)) {
      code = evaluateArguments(node, args, context, (arg, ctx) => arg === args[0] && arg.type === 'string' ? [`    ld hl, ${effect.label}`] : expression(arg, ctx));
      code.push('    pop hl', '    ld a, h', '    and a', '    pop de');
    } else code.push(...(node.args[0].type === 'name' ? expression(node.args[0], context) : [`    ld hl, ${effect.label}`]),
      '    push hl', ...expression(priority, context), '    ld a, h', '    and a', '    pop de');
    const done = helpers.label('sound_done');
    code.push(`    jp nz, ${done}`, '    ld a, l', '    cp 8', `    jp nc, ${done}`, '    ld h, d', '    ld l, e', ...sync, '    call PlaySound', `${done}:`, '    ld hl, 0');
    return code;
  }
  const signatures = { stop_sound: [0, 0, [], 'StopSound'], mute_sound: [0, 1, [1], 'MuteSound'], set_sound_volume: [2, 2, [7, 7], 'SetSoundVolume'] };
  const [min, max, defaults, routine] = signatures[node.name];
  if (node.args.length < min || node.args.length > max) fail(node, `${node.name} expects ${min === max ? min : `${min}..${max}`} arguments`);
  const args = defaults.map((value, i) => node.args[i] || { type: 'number', value, line: node.line });
  for (const arg of args) {
    numeric(arg, context);
    const value = literalNumber(arg);
    if (node.name === 'set_sound_volume' && value !== null && (value < 0 || value > 7)) fail(arg, 'Sound output volume must be 0..7');
  }
  const code = evaluateArguments(node, args, context, expression);
  for (let i = args.length - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  return [...code, ...sync, `    call ${routine}`, '    ld hl, 0'];
}
module.exports = { names, procedures, presets, collectSounds, emitSound };
