'use strict';

const fs = require('node:fs');
const path = require('node:path');
const font = require('./font');
const { prepareWorlds } = require('./world-assets');

function decodeBMP(data) {
  if (data.length < 54 || data.toString('ascii', 0, 2) !== 'BM') throw new Error('Expected a Windows BMP file');
  const dib = data.readUInt32LE(14);
  if (dib < 40 || 14 + dib > data.length) throw new Error('Unsupported or truncated BMP header');
  const width = data.readInt32LE(18);
  const signedHeight = data.readInt32LE(22);
  const height = Math.abs(signedHeight);
  const depth = data.readUInt16LE(28);
  const offset = data.readUInt32LE(10);
  if (width < 1 || width > 1024 || height < 1 || height > 1024) throw new Error('BMP dimensions must be 1..1024 pixels');
  if (data.readUInt16LE(26) !== 1 || data.readUInt32LE(30) !== 0 || ![1, 4, 8, 24, 32].includes(depth)) throw new Error('BMP must be uncompressed 1-, 4-, 8-, 24-, or 32-bit RGB');
  const stride = Math.ceil(width * depth / 32) * 4;
  if (offset < 14 + dib || offset + stride * height > data.length) throw new Error('Truncated BMP pixel data');
  const palette = [];
  if (depth <= 8) {
    const count = data.readUInt32LE(46) || (1 << depth);
    if (count > (1 << depth) || 14 + dib + count * 4 > offset) throw new Error('Invalid BMP indexed palette');
    for (let i = 0; i < count; i++) {
      const p = 14 + dib + i * 4;
      palette.push([data[p + 2], data[p + 1], data[p], 255]);
    }
  }
  const pixels = [];
  for (let y = 0; y < height; y++) {
    const row = offset + (signedHeight < 0 ? y : height - y - 1) * stride;
    for (let x = 0; x < width; x++) {
      let pixel;
      if (depth <= 8) {
        const index = depth === 8 ? data[row + x] : depth === 4 ? (data[row + (x >> 1)] >> ((1 - (x & 1)) * 4)) & 15 : (data[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (!palette[index]) throw new Error('BMP pixel refers to a missing palette color');
        pixel = palette[index];
      } else {
        const p = row + x * (depth / 8);
        pixel = [data[p + 2], data[p + 1], data[p], depth === 32 ? data[p + 3] : 255];
      }
      pixels.push(pixel);
    }
  }
  return { width, height, pixels, alpha: depth === 32 && pixels.some(pixel => pixel[3] > 0) };
}

const color15 = rgb => rgb.slice(0, 3).map(value => Math.round(value * 31 / 255));
const key = color => color.join(',');
const brightness = color => color[0] * 299 + color[1] * 587 + color[2] * 114;
const word = color => color[0] | color[1] << 5 | color[2] << 10;

function reduceColors(colors, limit) {
  if (!colors.length) return [[0, 0, 0]];
  const boxes = [colors];
  while (boxes.length < limit) {
    const candidates = boxes.map((box, index) => {
      const ranges = [0, 1, 2].map(axis => Math.max(...box.map(c => c.rgb[axis])) - Math.min(...box.map(c => c.rgb[axis])));
      const axis = ranges.indexOf(Math.max(...ranges));
      return { index, axis, range: ranges[axis], count: box.length };
    }).filter(box => box.count > 1).sort((a, b) => b.range - a.range);
    if (!candidates.length) break;
    const { index, axis } = candidates[0];
    const box = boxes[index].sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const half = box.reduce((sum, c) => sum + c.count, 0) / 2;
    let sum = 0;
    let split = 1;
    for (let i = 0; i < box.length - 1; i++) {
      sum += box[i].count;
      split = i + 1;
      if (sum >= half) break;
    }
    boxes.splice(index, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map(box => {
    const total = box.reduce((sum, c) => sum + c.count, 0);
    return [0, 1, 2].map(axis => Math.round(box.reduce((sum, c) => sum + c.rgb[axis] * c.count, 0) / total));
  }).sort((a, b) => brightness(b) - brightness(a));
}

function convertBMP(data, kind = 'sprite', frameWidth = 8, frameHeight = 8) {
  if (!['sprite', 'background', 'world'].includes(kind)) throw new Error('Asset kind must be sprite or background');
  const image = decodeBMP(data);
  if (image.width % 8 || image.height % 8) throw new Error('BMP dimensions must be multiples of 8');
  if (kind === 'background' && (image.width > 256 || image.height > 256)) throw new Error('Background maps must fit 32x32 tiles');
  if (kind !== 'sprite') { frameWidth = image.width; frameHeight = image.height; }
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth < 8 || frameHeight < 8 || frameWidth % 8 || frameHeight % 8 || image.width % frameWidth || image.height % frameHeight) throw new Error('Frame dimensions must be positive multiples of 8 and divide the BMP dimensions');
  const columns = frameWidth / 8;
  const rows = frameHeight / 8;
  if (kind === 'sprite' && columns * rows > 40) throw new Error('A sprite frame cannot use more than 40 hardware sprites');
  const frames = image.width / frameWidth * (image.height / frameHeight);
  if (frames > 255) throw new Error('A sheet cannot contain more than 255 frames');
  const transparent = image.pixels[0].slice(0, 3).join(',');
  const isTransparent = pixel => kind === 'sprite' && (image.alpha ? pixel[3] < 128 : pixel.slice(0, 3).join(',') === transparent);
  const colors = new Map();
  for (const pixel of image.pixels) {
    if (isTransparent(pixel)) continue;
    const rgb = color15(kind !== 'sprite' && image.alpha && pixel[3] < 128 ? [255, 255, 255] : pixel);
    const name = key(rgb);
    if (!colors.has(name)) colors.set(name, { rgb, count: 0 });
    colors.get(name).count++;
  }
  const reduced = reduceColors([...colors.values()], kind === 'sprite' ? 3 : 4);
  const palette = kind === 'sprite' ? [color15(image.pixels[0]), ...reduced] : reduced;
  while (palette.length < 4) palette.push(palette.at(-1));
  const indexed = image.pixels.map(pixel => {
    if (isTransparent(pixel)) return 0;
    const rgb = color15(kind !== 'sprite' && image.alpha && pixel[3] < 128 ? [255, 255, 255] : pixel);
    const start = kind === 'sprite' ? 1 : 0;
    let best = start;
    let distance = Infinity;
    for (let i = start; i < 4; i++) {
      const d = rgb.reduce((sum, value, axis) => sum + (value - palette[i][axis]) ** 2, 0);
      if (d < distance) { best = i; distance = d; }
    }
    return best;
  });
  const tiles = [];
  const tileIDs = new Map();
  const maps = [];
  for (let frame = 0; frame < frames; frame++) {
    const frameX = frame % (image.width / frameWidth) * frameWidth;
    const frameY = Math.floor(frame / (image.width / frameWidth)) * frameHeight;
    const map = [];
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
      const tile = [];
      for (let y = 0; y < 8; y++) {
        let low = 0; let high = 0;
        for (let x = 0; x < 8; x++) {
          const value = indexed[(frameY + ty * 8 + y) * image.width + frameX + tx * 8 + x];
          low |= (value & 1) << (7 - x);
          high |= (value >> 1) << (7 - x);
        }
        tile.push(low, high);
      }
      const signature = tile.join(',');
      if (!tileIDs.has(signature)) { tileIDs.set(signature, tiles.length); tiles.push(tile); }
      map.push(tileIDs.get(signature));
    }
    maps.push(map);
  }
  if (kind !== 'world' && tiles.length > 256) throw new Error('Converted image exceeds 256 unique tiles');
  return { kind, width: image.width, height: image.height, frameWidth, frameHeight, columns, rows, frames,
    palette: palette.map(word), sourceColors: colors.size, quantized: colors.size > (kind === 'sprite' ? 3 : 4), tiles, maps };
}

function collectAssets(ast, filename) {
  const assets = [];
  const calls = new Map();
  const cache = new Map();
  const declarations = new Map();
  const palettes = new Map();
  let bg = 1; let obj = 0;
  const base = filename === '<source>' ? process.cwd() : path.dirname(path.resolve(filename));
  function visit(nodes, top = true) {
    for (const node of nodes) {
      if (node.type === 'assign' && node.expression.type === 'call' && ['sprite_sheet', 'tile', 'tilemap', 'mutable_map', 'collision_map', 'worldmap'].includes(node.expression.name)) {
        const location = `${node.filename ? node.filename + ': ' : ''}Line ${node.line}`;
        if (!top) throw new Error(`${location}: asset declarations must be top-level assignments`);
        const call = node.expression;
        if (['tilemap', 'mutable_map', 'worldmap'].includes(call.name) && call.args[0]?.type === 'list') {
          const streamed = call.name === 'worldmap';
          const limit = streamed ? 128 : 32;
          const rows = call.args[0].items;
          const columns = rows[0]?.items?.length;
          if (call.args.length !== 1 || !columns || columns > limit || rows.length > limit || rows.some(row => row.type !== 'list' || row.items.length !== columns)) throw new Error(`${location}: ${streamed ? 'worldmaps' : 'nested tilemaps'} require nonempty, equal-length rows fitting ${limit}x${limit} tiles`);
          const cells = rows.flatMap(row => row.items.map(cell => {
            const tile = cell.type === 'name' && declarations.get(cell.name);
            if (!tile || tile.kind !== 'tile') throw new Error(`${location}: each nested tilemap cell must name a previously declared tile`);
            return tile;
          }));
          const asset = { kind: streamed ? 'world' : 'manual', mutable: call.name === 'mutable_map', columns, rows: rows.length, frames: 1, paletteIndex: 0, tiles: [], maps: [], cells, id: assets.length, label: `AssetMap${assets.length}` };
          assets.push(asset); calls.set(call, asset); declarations.set(node.name, asset);
          continue;
        }
        if (call.name === 'collision_map') {
          const rows = call.args[0]?.items;
          if (call.args.length !== 1 || !rows?.length || rows.some(row => row.type !== 'string')) throw new Error(`${location}: collision_map expects a nonempty literal list of string rows`);
          const columns = rows[0].value.length;
          if (columns < 1 || columns > 32 || rows.length > 32 || rows.some(row => row.value.length !== columns || /[^.#]/.test(row.value))) throw new Error(`${location}: collision rows must have equal widths, use only . and #, and fit 32x32 tiles`);
          const cells = rows.flatMap(row => [...row.value].map(c => c === '#' ? 1 : 0));
          const packed = Array(Math.ceil(cells.length / 8)).fill(0);
          cells.forEach((cell, i) => packed[i >> 3] |= cell << (i & 7));
          const asset = { kind: 'collision', columns, rows: rows.length, frames: 1, paletteIndex: 0, tiles: [], maps: [packed], id: assets.length, label: `AssetMap${assets.length}` };
          assets.push(asset); calls.set(call, asset);
          continue;
        }
        const streamed = call.name === 'worldmap';
        if (call.name === 'mutable_map') throw new Error(`${location}: mutable_map requires nested tile rows`);
        const sprite = call.name === 'sprite_sheet';
        const singleTile = call.name === 'tile';
        let solid = false; let terrain = 0; let tileX = 0; let tileY = 0; let atlas = false;
        if (singleTile) {
          const options = new Set();
          for (const option of call.args.slice(1)) {
            if (option.type !== 'keyword' || !['solid', 'terrain', 'x', 'y'].includes(option.name) || options.has(option.name)) throw new Error(`${location}: tile options must be unique solid=, terrain=, x= and y= keywords`);
            options.add(option.name);
            if (option.name === 'solid') {
              if (option.expression.type !== 'boolean') throw new Error(`${location}: solid must be a literal True or False`);
              solid = option.expression.value;
            } else if (option.name === 'terrain') {
              if (option.expression.type !== 'number' || !Number.isInteger(option.expression.value) || option.expression.value < 0 || option.expression.value > 255) throw new Error(`${location}: terrain must be a literal integer 0..255`);
              terrain = option.expression.value;
            } else {
              if (option.expression.type !== 'number' || !Number.isInteger(option.expression.value) || option.expression.value < 0 || option.expression.value > 31) throw new Error(`${location}: tile atlas coordinates must be literal integers 0..31`);
              if (option.name === 'x') tileX = option.expression.value;
              else tileY = option.expression.value;
              atlas = true;
            }
          }
        }
        if (call.args.length < 1 || call.args.length > (singleTile ? 5 : sprite ? 3 : streamed ? 2 : 1) || call.args[0].type !== 'string' || (!singleTile && !streamed && call.args.slice(1).some(arg => arg.type !== 'number'))) throw new Error(`${location}: use sprite_sheet("file.bmp", width, height), tilemap("file.bmp"), or tile("file.bmp", solid=True, terrain=1) with literal arguments`);
        const sourceBase = node.filename && node.filename !== '<source>' ? path.dirname(path.resolve(node.filename)) : base;
        const file = path.resolve(sourceBase, call.args[0].value);
        const width = singleTile ? 8 : call.args[1]?.value ?? 8;
        const height = singleTile ? 8 : call.args[2]?.value ?? 8;
        const signature = JSON.stringify([file, sprite, width, height, singleTile, solid, terrain, streamed, streamed ? call.args[1] : null, tileX, tileY, atlas]);
        if (!cache.has(signature)) {
          const paletteKey = JSON.stringify([file, sprite]);
          if (!palettes.has(paletteKey)) palettes.set(paletteKey, sprite ? obj++ : bg++);
          const paletteIndex = palettes.get(paletteKey);
          if (paletteIndex > 7) throw new Error(`${location}: at most 8 sprite palettes and 7 imported background palettes are available`);
          let converted;
          try { converted = convertBMP(fs.readFileSync(file), sprite ? 'sprite' : streamed ? 'world' : 'background', width, height); }
          catch (error) { throw new Error(`${location}: ${file}: ${error.message}`); }
          if (singleTile) {
            if (!atlas && (converted.width !== 8 || converted.height !== 8)) throw new Error(`${location}: tile BMP must be exactly 8x8 pixels; select an atlas tile with x= and y=`);
            if (tileX >= converted.columns || tileY >= converted.rows) throw new Error(`${location}: tile atlas coordinates are outside the BMP`);
            const pattern = converted.tiles[converted.maps[0][tileY * converted.columns + tileX]];
            converted = { ...converted, width: 8, height: 8, frameWidth: 8, frameHeight: 8, columns: 1, rows: 1, frames: 1, tiles: [pattern], maps: [[0]] };
          }
          let collision;
          if (streamed && call.args[1]) {
            const option = call.args[1];
            const rows = option.type === 'keyword' && option.name === 'collision' && option.expression.type === 'list' && option.expression.items;
            if (!rows || rows.length !== converted.rows || rows.some(row => row.type !== 'string' || row.value.length !== converted.columns || /[^.#]/.test(row.value))) throw new Error(`${location}: worldmap collision must be literal . and # rows matching the BMP tile dimensions`);
            collision = rows.flatMap(row => [...row.value].map(c => c === '#' ? 1 : 0));
          }
          const asset = { ...converted, ...(streamed ? { collision } : {}), ...(singleTile ? { kind: 'tile', solid, terrain } : {}), file, paletteIndex, id: assets.length, label: `AssetMap${assets.length}` };
          assets.push(asset); cache.set(signature, asset);
        }
        calls.set(call, cache.get(signature));
        declarations.set(node.name, cache.get(signature));
      }
      if (node.type === 'if') {
        node.branches.forEach(branch => visit(branch.body, false)); visit(node.otherwise, false);
      } else if (node.body) visit(node.body, false);
    }
  }
  visit(ast);
  const streamedTiles = new Set(assets.filter(asset => asset.kind === 'world' && asset.cells).flatMap(asset => asset.cells));
  const residentTiles = new Set([
    ...assets.filter(asset => asset.kind === 'manual').flatMap(asset => asset.cells),
    ...(assets.some(asset => asset.mutable) ? assets.filter(asset => asset.kind === 'tile') : [])
  ]);
  const tileData = [...font.bytes];
  const globalTiles = new Map();
  for (let i = 0; i < tileData.length / 16; i++) globalTiles.set(tileData.slice(i * 16, i * 16 + 16).join(','), i);
  for (const asset of assets) {
    if (['collision', 'manual', 'world'].includes(asset.kind) || (streamedTiles.has(asset) && !residentTiles.has(asset))) continue;
    const ids = asset.tiles.map(tile => {
      const signature = tile.join(',');
      if (!globalTiles.has(signature)) {
        if (tileData.length / 16 >= 256) throw new Error(`${asset.file}: font and imported assets exceed the shared 256-tile budget`);
        globalTiles.set(signature, tileData.length / 16); tileData.push(...tile);
      }
      return globalTiles.get(signature);
    });
    asset.maps = asset.maps.map(map => map.map(id => ids[id]));
  }
  for (const asset of assets.filter(asset => asset.kind === 'manual')) {
    const unique = [...new Set(asset.cells)];
    asset.definitions = unique.map(tile => [tile.maps[0][0], tile.paletteIndex | (tile.solid ? 128 : 0), tile.terrain]);
    asset.cellMap = asset.cells.map(tile => unique.indexOf(tile));
    asset.maps = [asset.cells.map(tile => tile.maps[0][0])];
    if (asset.mutable) asset.initialCells = asset.cellMap.flatMap(index => asset.definitions[index]);
    delete asset.cells;
  }
  if (assets.length > 255) throw new Error('At most 255 asset handles are supported');
  const worldObjects = prepareWorlds(assets, tileData.length / 16);
  return { assets, calls, tileData, worldObjects, streaming: assets.some(asset => asset.kind === 'world'), scrolling: assets.some(asset => asset.kind === 'world') };
}

function parseColor(node) {
  if (node.type === 'number' && Number.isInteger(node.value) && node.value >= 0 && node.value <= 32767) return node.value;
  if (node.type === 'string' && /^#[0-9a-f]{6}$/i.test(node.value)) return word(color15([1, 3, 5].map(offset => parseInt(node.value.slice(offset, offset + 2), 16))));
  throw new Error(`${node.filename ? node.filename + ': ' : ''}Line ${node.line}: palette colors must be "#RRGGBB" strings or 0..32767 RGB15 integer literals`);
}

module.exports = { decodeBMP, convertBMP, collectAssets, parseColor };
