'use strict';
const { parseColor } = require('./assets');
const { evaluateArguments } = require('./builtin-arguments');

const procedures = ['refresh_screen', 'bg_palette', 'sprite_palette', 'clear_screen', 'sprite', 'hide_sprite', 'draw_map', 'draw_background', 'draw_tile_grid', 'draw_tile_field', 'draw_world', 'set_camera', 'world_sprite', 'show_window', 'hide_window', 'window_position', 'clear_window', 'print_window'];
const names = [...procedures, 'background_clip', 'sprite_sheet', 'tile', 'tilemap', 'mutable_map', 'set_map_tile', 'reset_map', 'collision_map', 'worldmap', 'tile_terrain', 'tile_is_solid', 'rect_is_solid', 'tile_at', 'map_width', 'map_height', 'camera_x', 'camera_y'];

function emitGraphics(node, context, helpers, graphics) {
  const { fail, expression, numeric, literalNumber, label } = helpers;
  if (!names.includes(node.name)) return null;
  if (['background_clip', 'sprite_sheet', 'tile', 'tilemap', 'mutable_map', 'collision_map', 'worldmap'].includes(node.name)) {
    const asset = graphics.calls.get(node);
    if (!asset) fail(node, 'Asset imports must be top-level assignments with literal arguments');
    return [`    ld hl, ${asset.id}`];
  }
  if (['show_window', 'hide_window', 'window_position', 'clear_window', 'print_window'].includes(node.name)) graphics.window = true;
  if (node.name === 'print_window') return null;
  if (['draw_world', 'set_camera', 'world_sprite', 'camera_x', 'camera_y'].includes(node.name)) graphics.scrolling = true;
  if (['camera_x', 'camera_y'].includes(node.name)) {
    if (node.args.length) fail(node, `${node.name} expects no arguments`);
    return [`    ld a, [${node.name === 'camera_x' ? 'wCameraX' : 'wCameraY'}]`, '    ld l, a', ...(graphics.streaming ? [`    ld a, [${node.name === 'camera_x' ? 'wCameraX' : 'wCameraY'} + 1]`, '    ld h, a'] : ['    ld h, 0'])];
  }
  if (node.name === 'refresh_screen') {
    if (node.args.length) fail(node, 'refresh_screen expects no arguments');
    return ['    call RefreshScreen', '    ld hl, 0'];
  }
  if (['bg_palette', 'sprite_palette'].includes(node.name)) {
    if (node.args.length !== 5) fail(node, `${node.name} expects (index, color0, color1, color2, color3)`);
    const index = literalNumber(node.args[0]);
    if (index === null || index < 0 || index > 7) fail(node, 'Palette index must be a literal 0..7');
    const colors = node.args.slice(1).map(parseColor);
    const name = label('palette');
    graphics.paletteLiterals.push({ label: name, bytes: colors.flatMap(color => [color & 255, color >> 8]) });
    return [`    ld hl, ${name}`, `    ld a, ${index}`, `    call ${node.name === 'bg_palette' ? 'SetBGPalette' : 'SetSpritePalette'}`, '    ld hl, 0'];
  }
  if (node.name === 'draw_tile_grid') {
    if (node.args.length < 2 || node.args.length > 4) fail(node, 'draw_tile_grid expects (cells, columns, x=0, y=0)');
    const symbol = helpers.arraySymbol(node.args[0], context);
    if (symbol.type !== 'array') fail(node.args[0], 'draw_tile_grid requires an integer array');
    const args = [node.args[0], node.args[1], node.args[2] || {type:'number',value:0}, node.args[3] || {type:'number',value:0}];
    for (let i = 1; i < 4; i++) {
      numeric(args[i], context);
      const value = literalNumber(args[i]);
      if (value !== null && (value < (i === 1 ? 1 : 0) || value > (i === 1 ? 32 : i === 2 ? 19 : 17))) fail(args[i], 'Grid columns must be 1..32 and starting coordinates must fit the screen');
    }
    graphics.tileGrid = true;
    const code = evaluateArguments(node, args, context, expression);
    for (let i = 3; i >= 0; i--) code.push('    pop hl','    ld a, l',`    ld [wArg${i}], a`,'    ld a, h',`    ld [wArg${i} + 1], a`);
    code.push(...helpers.arrayLength(symbol),'    ld a, l','    ld [wGridLength], a','    ld a, h','    ld [wGridLength + 1], a',
      ...helpers.arrayBank(symbol),'    ld a, l','    ld [wGridBank], a','    ld a, h','    ld [wGridBank + 1], a',
      '    call DrawTileGrid','    ld hl, 0');
    return code;
  }
  if (node.name === 'draw_tile_field') {
    if (node.args.length < 3 || node.args.length > 5) fail(node, 'draw_tile_field expects (columns, rows, tiles, x=0, y=0)');
    const arrays = node.args.slice(0, 3).map(arg => helpers.arraySymbol(arg, context));
    if (arrays.some(symbol => symbol.type !== 'array')) fail(node, 'Field inputs must be integer arrays');
    const length = arrays[2].length;
    if (length !== undefined && (length < 2 || length > 64 || (length & (length - 1)))) fail(node, 'Field tile list length must be a power of two from 2 to 64');
    const args = [...node.args.slice(0, 3), node.args[3] || {type:'number',value:0}, node.args[4] || {type:'number',value:0}];
    for (let i = 3; i < 5; i++) {
      numeric(args[i], context);
      const value = literalNumber(args[i]);
      if (value !== null && (value < 0 || value > (i === 3 ? 19 : 17))) fail(args[i], 'Field starting coordinates must fit the screen');
    }
    graphics.tileGrid = true;
    graphics.tileField = true;
    const code = evaluateArguments(node, args, context, expression);
    for (let i = 4; i >= 0; i--) code.push('    pop hl','    ld a, l',`    ld [wArg${i}], a`,'    ld a, h',`    ld [wArg${i} + 1], a`);
    for (let i = 0; i < 3; i++) code.push(...helpers.arrayLength(arrays[i]),'    ld a, l',`    ld [wFieldLength${i}], a`,'    ld a, h',`    ld [wFieldLength${i} + 1], a`,
      ...helpers.arrayBank(arrays[i]),'    ld a, l',`    ld [wFieldBank${i}], a`,'    ld a, h',`    ld [wFieldBank${i} + 1], a`);
    return [...code,'    call DrawTileField','    ld hl, 0'];
  }
  const queries = { set_map_tile: [4, 'SetMapTile'], reset_map: [1, 'ResetMutableMap'], rect_is_solid: [5, 'RectIsSolid'], tile_terrain: [3, 'TileTerrain'], tile_is_solid: [3, 'TileIsSolid'], tile_at: [3, 'TileAt'], map_width: [1, 'MapWidth'], map_height: [1, 'MapHeight'] };
  if (queries[node.name]) {
    if (['set_map_tile', 'reset_map'].includes(node.name)) graphics.mutation = true;
    if (node.name === 'rect_is_solid') graphics.terrainRectangles = true;
    const [count, routine] = queries[node.name];
    if (node.args.length !== count) fail(node, `${node.name} expects ${count} arguments`);
    for (const arg of node.args) numeric(arg, context);
    const code = evaluateArguments(node, node.args, context, expression);
    for (let i = count - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
    return [...code, `    call ${routine}`];
  }
  const signatures = {
    draw_background: { min: 2, max: 4, defaults: [0, 0, 0, 0], routine: 'DrawBackground' },
    show_window: { min: 0, max: 0, defaults: [], routine: 'ShowWindow' },
    hide_window: { min: 0, max: 0, defaults: [], routine: 'HideWindow' },
    window_position: { min: 2, max: 2, defaults: [0, 0], routine: 'WindowPosition' },
    clear_window: { min: 0, max: 1, defaults: [0], routine: 'ClearWindow' },
    clear_screen: { min: 0, max: 1, defaults: [0], routine: 'ClearScreen' },
    sprite: { min: 5, max: 7, defaults: [0, 0, 0, 0, 0, 0, 0], routine: 'DrawSprite' },
    hide_sprite: { min: 1, max: 1, defaults: [0], routine: 'HideSprite' },
    draw_world: { min: 1, max: 1, defaults: [0], routine: 'DrawWorld' },
    set_camera: { min: 2, max: 2, defaults: [0, 0], routine: 'SetCamera' },
    world_sprite: { min: 5, max: 7, defaults: [0, 0, 0, 0, 0, 0, 0], routine: 'DrawWorldSprite' },
    draw_map: { min: 3, max: 3, defaults: [0, 0, 0], routine: 'DrawMap' }
  };
  const signature = signatures[node.name];
  if (node.args.length < signature.min || node.args.length > signature.max) fail(node, `${node.name} expects ${signature.min === signature.max ? signature.min : `${signature.min}..${signature.max}`} arguments`);
  const args = signature.defaults.map((value, i) => node.args[i] || { type: 'number', value, line: node.line });
  const bounded = ['clear_screen', 'clear_window'].includes(node.name) ? [[0, 7]]
    : node.name === 'window_position' ? [[0, 159], [1, 143]]
    : ['sprite', 'world_sprite', 'hide_sprite'].includes(node.name) ? [[0, 39]] : node.name === 'draw_map' ? [[1, 19], [2, 17]]
    : node.name === 'draw_background' ? [[2, 19], [3, 17]] : [];
  for (const [index, maximum] of bounded) {
    const value = literalNumber(args[index]);
    if (value !== null && (value < 0 || value > maximum)) fail(node, `${node.name} argument ${index + 1} must be 0..${maximum}`);
  }
  for (const arg of args) numeric(arg, context);
  const code = evaluateArguments(node, args, context, expression);
  for (let i = args.length - 1; i >= 0; i--) code.push('    pop hl', '    ld a, l', `    ld [wArg${i}], a`, '    ld a, h', `    ld [wArg${i} + 1], a`);
  return [...code, `    call ${signature.routine}`, '    ld hl, 0'];
}

module.exports = { names, procedures, emitGraphics };
