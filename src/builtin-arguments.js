'use strict';

// These are public Pyson parameter names, independent of runtime register names.
// A missing default means the parameter is required.
const signatures = {
  print: ['value', 'x', 'y', ['palette', 0]],
  print_window: ['value', 'x', 'y', ['palette', 0]],
  bg_palette: ['index', 'color0', 'color1', 'color2', 'color3'],
  sprite_palette: ['index', 'color0', 'color1', 'color2', 'color3'],
  clear_screen: [['palette', 0]], clear_window: [['palette', 0]],
  sprite: ['slot', 'sheet', 'frame', 'x', 'y', ['flip_x', false], ['flip_y', false]],
  world_sprite: ['slot', 'sheet', 'frame', 'x', 'y', ['flip_x', false], ['flip_y', false]],
  hide_sprite: ['slot'], draw_map: ['map', 'x', 'y'], draw_world: ['map'],
  set_camera: ['x', 'y'], window_position: ['x', 'y'],
  set_map_tile: ['map', 'x', 'y', 'tile'], reset_map: ['map'],
  rect_is_solid: ['map', 'x', 'y', 'width', 'height'],
  tile_terrain: ['map', 'x', 'y'], tile_is_solid: ['map', 'x', 'y'], tile_at: ['map', 'x', 'y'],
  map_width: ['map'], map_height: ['map'],
  sprite_sheet: ['path', ['width', 8], ['height', 8]],
  tile: ['path', ['solid', false], ['terrain', 0], ['x', 0], ['y', 0]],
  tilemap: ['source'], mutable_map: ['rows'], collision_map: ['rows'],
  worldmap: ['source', ['collision', null]],
  constant: ['value'], constant_table: ['values'],
  fixed: ['value'], int: ['value'],
  sprite_animation: ['sheet', 'steps', ['loop', true]],
  play_animation: ['slot', 'animation', ['restart', false]],
  restart_animation: ['slot'], stop_animation: ['slot'], update_animations: [['ticks', 1]],
  animated_sprite: ['slot', 'x', 'y', ['flip_x', false], ['flip_y', false]],
  world_animated_sprite: ['slot', 'x', 'y', ['flip_x', false], ['flip_y', false]],
  animation_frame: ['slot'], animation_finished: ['slot'], animation_playing: ['slot'],
  save_write: ['slot', 'value'], save_read: ['slot', ['default', 0]],
  save_exists: ['slot'], save_delete: ['slot'],
  random_seed: ['seed'], randint: ['low', 'high'], randrange: [['start', 0], 'stop'],
  rect_overlap: ['ax', 'ay', 'aw', 'ah', 'bx', 'by', 'bw', 'bh'],
  elapsed_frames: ['previous'], wait_frames: ['count'],
  button: ['name'], button_pressed: ['name'], len: ['array'],
  dialogue_speaker: ['name'], dialogue_portrait: ['sheet', ['frame', 0], ['palette', 0]],
  start_dialogue: ['text', ['speed', 2], ['palette', 0]],
  start_choices: ['labels', ['palette', 0], ['selected_palette', 0], ['default', 0], ['cancel', true]],
  music_track: ['notes', ['loop', true], ['duty', 2], ['voice', 0], ['instrument', 'triangle']],
  music_file: ['path', ['part', 0]], play_music: ['track', ['restart', false]],
  sound_effect: ['channel', 'steps', ['priority', 3], ['duty', 2]],
  // Priority defaults to the selected effect, so it is never synthesized here.
  play_sound: ['effect', ['priority', null]], mute_sound: [['muted', true]],
  set_sound_volume: ['left', 'right'],
  reset_pool: ['pool'], pool_count: ['pool'], despawn: ['handle'], pool_index: ['handle']
};
for (const name of ['refresh_screen', 'show_window', 'hide_window', 'camera_x', 'camera_y',
  'save_clear', 'save_capacity', 'frame_count', 'wait_vblank', 'read_buttons',
  'stop_music', 'pause_music', 'resume_music', 'music_playing', 'stop_sound', 'sound_playing',
  'update_dialogue', 'close_dialogue', 'dialogue_active', 'dialogue_waiting', 'dialogue_finished',
  'choices_active', 'choices_finished', 'choices_cancelled', 'choices_result', 'choices_selected']) signatures[name] = [];

const literal = (value, node) => ({ type: typeof value === 'boolean' ? 'boolean' : typeof value === 'string' ? 'string' : 'number', value, line: node.line });

function normalize(node, fail) {
  if (node.type !== 'call' || !Object.hasOwn(signatures, node.name) || !node.args.some(arg => arg.type === 'keyword')) return;
  const signature = signatures[node.name];
  const names = signature.map(param => Array.isArray(param) ? param[0] : param);
  const args = new Array(signature.length).fill(null), order = [];
  let named = false;
  node.args.forEach((arg, index) => {
    if (arg.type !== 'keyword' && named) fail(arg, 'Positional arguments must precede keywords');
    if (index > 0 && arg.type !== 'keyword' && ['tile', 'worldmap'].includes(node.name)) fail(arg, `${node.name} options must use keywords`);
    const slot = arg.type === 'keyword' ? names.indexOf(arg.name) : index;
    named ||= arg.type === 'keyword';
    if (slot < 0 || slot >= args.length) {
      const hint = `Use these argument names for ${node.name}: ${names.join(', ') || '(no arguments)'}.`;
      fail(arg, `${node.name}: unknown or excess argument "${arg.name || index + 1}"`, hint);
    }
    if (args[slot]) fail(arg, `${node.name}: duplicate argument "${names[slot]}"`);
    args[slot] = arg.type === 'keyword' ? arg.expression : arg;
    order.push(slot);
  });
  signature.forEach((param, index) => {
    if (!args[index] && !Array.isArray(param)) fail(node, `${node.name}: missing required argument "${param}"`);
  });
  // These collectors consume named compile-time options. Keep absent options absent
  // (e.g. pulse music must not acquire a wave instrument, nor noise a pulse duty).
  if (['tile', 'worldmap', 'music_track'].includes(node.name)) {
    node.args = [args[0], ...args.slice(1).flatMap((arg, index) => arg ? [{ type: 'keyword', name: names[index + 1], expression: arg, line: arg.line }] : [])];
    return;
  }
  const length = Math.max(...order, -1) + 1;
  for (let index = 0; index < length; index++) if (!args[index]) {
    args[index] = literal(signature[index][1], node); order.push(index);
  }
  node.args = args.slice(0, length);
  node.argumentOrder = order;
}

function argumentOrder(node, args) {
  const order = [...(node.argumentOrder || args.map((_, i) => i))];
  for (let i = 0; i < args.length; i++) if (!order.includes(i)) order.push(i);
  return order;
}

function reordered(node, args) { return argumentOrder(node, args).some((index, i) => index !== i); }

// Evaluate once in source order, then arrange values into the canonical stack
// order expected by the emitters. Positional calls keep their existing assembly.
// Stack scratch belongs to this call, so nested calls cannot overwrite it.
function evaluateArguments(node, args, context, expression) {
  const order = argumentOrder(node, args), code = [];
  for (const index of order) code.push(...expression(args[index], context), '    push hl');
  if (!reordered(node, args)) return code;
  const count = args.length;
  for (let i = 0; i < count; i++) {
    const offset = 2 * (count - 1 - order.indexOf(i) + i);
    code.push(`    ld hl, sp + ${offset}`, '    ld a, [hli]', '    ld h, [hl]', '    ld l, a', '    push hl');
  }
  for (let i = 0; i < count; i++) code.push(`    ld hl, sp + ${2 * i}`, '    ld a, [hli]', '    ld d, [hl]', '    ld e, a',
    `    ld hl, sp + ${2 * (i + count)}`, '    ld a, e', '    ld [hli], a', '    ld [hl], d');
  code.push(`    add sp, ${2 * count}`);
  return code;
}

module.exports = { signatures, normalize, argumentOrder, reordered, evaluateArguments };
