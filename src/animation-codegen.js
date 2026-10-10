'use strict';
const { evaluateArguments } = require('./builtin-arguments');

const procedures = ['play_animation', 'restart_animation', 'stop_animation', 'update_animations', 'animated_sprite', 'world_animated_sprite'];
const names = ['sprite_animation', ...procedures, 'animation_frame', 'animation_finished', 'animation_playing'];
const error = (node, message) => { throw new Error(`${node.filename ? node.filename + ': ' : ''}Line ${node.line}: ${message}`); };
const option = (node, name) => {
  if (node?.type !== 'keyword') return node;
  if (node.name !== name) error(node, `Expected ${name}= option`);
  return node.expression;
};

function collectAnimations(ast, graphics) {
  const sheets = new Map();
  const definitions = new Map();
  const calls = new Map();
  const used = new Map();
  let enabled = false;
  const visit = (value, fn) => {
    if (!value || typeof value !== 'object') return;
    fn(value);
    Object.values(value).forEach(child => { if (child && typeof child === 'object') visit(child, fn); });
  };
  for (const node of ast) {
    if (node.type === 'assign') {
      const asset = graphics.calls.get(node.expression);
      if (asset) sheets.set(node.name, asset);
    }
    visit(node, value => {
      if (value.type !== 'call' || value.name !== 'sprite_animation') return;
      if (node.type !== 'assign' || node.expression !== value) error(value, 'sprite_animation declarations must be top-level assignments');
      const args = value.args;
      const sheet = args[0]?.type === 'name' && sheets.get(args[0].name);
      if (args.length < 2 || args.length > 3 || !sheet || sheet.kind !== 'sprite' || args[1].type !== 'list') error(value, 'Use sprite_animation(named_sprite_sheet, [[frame, ticks], ...], loop=True)');
      if (!args[1].items.length || args[1].items.length > 64) error(value, 'Animations require 1..64 steps');
      const steps = args[1].items.map(step => {
        if (step.type !== 'list' || step.items.length !== 2) error(step, 'Each animation step must be [frame, ticks]');
        const [frame, ticks] = step.items;
        if (frame.type !== 'number' || !Number.isInteger(frame.value) || frame.value < 0 || frame.value >= sheet.frames) error(frame, `Animation frame must be a literal 0..${sheet.frames - 1} for this sprite sheet`);
        if (ticks.type !== 'number' || !Number.isInteger(ticks.value) || ticks.value < 1 || ticks.value > 255) error(ticks, 'Animation duration must be a literal 1..255 ticks');
        return [frame.value, ticks.value];
      });
      const loop = option(args[2], 'loop');
      if (loop && loop.type !== 'boolean') error(loop, 'Animation loop must be literal True or False');
      if (definitions.has(node.name)) error(value, `Duplicate sprite_animation declaration "${node.name}"`);
      const animation = { name: node.name, label: `AnimationData${definitions.size}`, sheet: sheet.id, steps, loop: loop ? loop.value : true };
      animation.bytes = [sheet.id, steps.length, Number(animation.loop), ...steps.flat()];
      definitions.set(node.name, animation);
      calls.set(value, animation);
    });
  }
  visit(ast, node => {
    if (node.type !== 'call') return;
    if (names.includes(node.name) && node.name !== 'sprite_animation') enabled = true;
    if (node.name !== 'play_animation') return;
    const definition = node.args[1]?.type === 'name' && definitions.get(node.args[1].name);
    if (!definition) error(node, 'play_animation requires (slot, named_sprite_animation[, restart])');
    calls.set(node, definition);
    used.set(definition.label, definition);
  });
  return { definitions, calls, used, enabled };
}

function emitAnimation(node, context, helpers, animation, graphics) {
  if (!names.includes(node.name)) return null;
  const { fail, expression, numeric, literalNumber, typeOf } = helpers;
  if (node.name === 'sprite_animation') {
    const definition = animation.calls.get(node);
    if (!definition) fail(node, 'sprite_animation declarations must be top-level assignments');
    return [`    ld hl, ${animation.used.has(definition.label) ? definition.label : 0}`];
  }
  if (node.name === 'world_animated_sprite') graphics.scrolling = true;
  const signatures = {
    play_animation: [2, 3, [null, null, 0], 'PlayAnimation'],
    restart_animation: [1, 1, [null], 'RestartAnimation'],
    stop_animation: [1, 1, [null], 'StopAnimation'],
    update_animations: [0, 1, [1], 'UpdateAnimations'],
    animated_sprite: [3, 5, [null, null, null, 0, 0], 'DrawAnimatedSprite'],
    world_animated_sprite: [3, 5, [null, null, null, 0, 0], 'DrawWorldAnimatedSprite'],
    animation_frame: [1, 1, [null], 'AnimationFrame'],
    animation_finished: [1, 1, [null], 'AnimationFinished'],
    animation_playing: [1, 1, [null], 'AnimationPlaying']
  };
  const [min, max, defaults, routine] = signatures[node.name];
  if (node.args.length < min || node.args.length > max) fail(node, `${node.name} expects ${min === max ? min : `${min}..${max}`} arguments`);
  const args = defaults.map((value, i) => node.args[i] || { type: 'number', value, line: node.line });
  for (let i = 0; i < args.length; i++) {
    const arg = node.name === 'play_animation' && i === 2 ? option(args[i], 'restart') : args[i];
    if (node.name === 'play_animation' && i === 1) {
      if (typeOf(arg, context.scope) !== 'animation') fail(arg, 'play_animation expects a named sprite_animation, not an integer or shadowing local');
    } else {
      numeric(arg, context);
      const value = literalNumber(arg);
      if (value !== null && i === 0 && (value < 0 || value > (node.name === 'update_animations' ? 255 : 39))) fail(arg, node.name === 'update_animations' ? 'Animation update ticks must be 0..255' : 'Animation slot must be 0..39');
    }
    args[i] = arg;
  }
  const code = evaluateArguments(node, args, context, expression);
  for (let i = args.length - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  return [...code, `    call ${routine}`];
}

module.exports = { names, procedures, collectAnimations, emitAnimation };
