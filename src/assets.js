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
  if (width < 1 || width > 2048 || height < 1 || height > 2048) throw new Error('BMP dimensions must be 1..2048 pixels');
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
  const indices = depth <= 8 ? [] : null;
  for (let y = 0; y < height; y++) {
    const row = offset + (signedHeight < 0 ? y : height - y - 1) * stride;
    for (let x = 0; x < width; x++) {
      let pixel;
      if (depth <= 8) {
        const index = depth === 8 ? data[row + x] : depth === 4 ? (data[row + (x >> 1)] >> ((1 - (x & 1)) * 4)) & 15 : (data[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (!palette[index]) throw new Error('BMP pixel refers to a missing palette color');
        indices.push(index);
        pixel = palette[index];
      } else {
        const p = row + x * (depth / 8);
        pixel = [data[p + 2], data[p + 1], data[p], depth === 32 ? data[p + 3] : 255];
      }
      pixels.push(pixel);
    }
  }
  return { width, height, pixels, indices, palette, alpha: depth === 32 && pixels.some(pixel => pixel[3] > 0) };
}

// Indexed color groups preserve their explicit shade numbers on DMG. Each
// tile chooses one group of four, as required by the CGB background hardware.
function convertIndexedBMP(data,kind,count){
 const image=decodeBMP(data);
 if(!image.indices)throw Error('Multiple palettes require an indexed 1-, 4- or 8-bit BMP');
 if(image.width%8||image.height%8)throw Error('BMP dimensions must be multiples of 8');
 const palettes=Array.from({length:count},(_,p)=>Array.from({length:4},(_,c)=>word(color15(image.palette[p*4+c]||[0,0,0]))));
 const tiles=[],ids=new Map(),map=[],attributes=[];
 for(let ty=0;ty<image.height;ty+=8)for(let tx=0;tx<image.width;tx+=8){
  const groups=new Set(),tile=[];
  for(let y=0;y<8;y++){let lo=0,hi=0;for(let x=0;x<8;x++){
   const index=image.indices[(ty+y)*image.width+tx+x],group=index>>2;
   if(group>=count)throw Error(`BMP tile (${tx/8}, ${ty/8}) uses palette ${group}, outside palettes=${count}`);
   groups.add(group);lo|=(index&1)<<(7-x);hi|=((index>>1)&1)<<(7-x);
  }tile.push(lo,hi);}
  if(groups.size>1)throw Error(`BMP tile (${tx/8}, ${ty/8}) mixes palette groups; each 8x8 tile must use one group of four colors`);
  const signature=tile.join(',');if(!ids.has(signature)){ids.set(signature,tiles.length);tiles.push(tile);}map.push(ids.get(signature));attributes.push([...groups][0]);
 }
 if(tiles.length>256)throw Error('Converted image exceeds 256 unique tiles');
 const dmgPalette=palettes[0].reduce((n,c,i)=>n|(Math.max(0,Math.min(3,Math.round(3-((c&31)*299+((c>>5)&31)*587+((c>>10)&31)*114)*3/31000)))<<(i*2)),0);
 return {kind,width:image.width,height:image.height,columns:image.width/8,rows:image.height/8,frames:1,frameWidth:image.width,frameHeight:image.height,tiles,maps:[map],attributes,palettes,palette:palettes[0],paletteCount:count,dmgPalette,sourceColors:new Set(image.indices).size,quantized:false};
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
  if (!['sprite', 'actor', 'background', 'scene', 'world', 'clip', 'atlas'].includes(kind)) throw new Error('Asset kind must be sprite or background');
  const spritePixels = kind === 'sprite' || kind === 'actor';
  const image = decodeBMP(data);
  if (!['clip', 'atlas'].includes(kind) && (image.width > 1024 || image.height > 1024)) throw new Error('BMP dimensions must be 1..1024 pixels outside background clip sheets and tile atlases');
  if (image.width % 8 || image.height % 8) throw new Error('BMP dimensions must be multiples of 8');
  if (kind === 'background' && (image.width > 256 || image.height > 256)) throw new Error('Background maps must fit 32x32 tiles');
  if (!['sprite', 'actor', 'clip'].includes(kind)) { frameWidth = image.width; frameHeight = image.height; }
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth < 8 || frameHeight < 8 || frameWidth % 8 || frameHeight % 8 || image.width % frameWidth || image.height % frameHeight) throw new Error('Frame dimensions must be positive multiples of 8 and divide the BMP dimensions');
  const columns = frameWidth / 8;
  const rows = frameHeight / 8;
  if (kind === 'sprite' && columns * rows > 40) throw new Error('A sprite frame cannot use more than 40 hardware sprites');
  const frames = image.width / frameWidth * (image.height / frameHeight);
  if (frames > 255) throw new Error('A sheet cannot contain more than 255 frames');
  const transparent = image.pixels[0].slice(0, 3).join(',');
  const isTransparent = pixel => spritePixels && (image.alpha ? pixel[3] < 128 : pixel.slice(0, 3).join(',') === transparent);
  const colors = new Map();
  for (const pixel of image.pixels) {
    if (isTransparent(pixel)) continue;
    const rgb = color15(!spritePixels && image.alpha && pixel[3] < 128 ? [255, 255, 255] : pixel);
    const name = key(rgb);
    if (!colors.has(name)) colors.set(name, { rgb, count: 0 });
    colors.get(name).count++;
  }
  const reduced = reduceColors([...colors.values()], spritePixels ? 3 : 4);
  const palette = spritePixels ? [color15(image.pixels[0]), ...reduced] : reduced;
  while (palette.length < 4) palette.push(palette.at(-1));
  const indexed = image.pixels.map(pixel => {
    if (isTransparent(pixel)) return 0;
    const rgb = color15(!spritePixels && image.alpha && pixel[3] < 128 ? [255, 255, 255] : pixel);
    const start = spritePixels ? 1 : 0;
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
  if (!['world', 'clip', 'actor', 'atlas'].includes(kind) && tiles.length > 256) throw new Error('Converted image exceeds 256 unique tiles');
  return { kind, width: image.width, height: image.height, frameWidth, frameHeight, columns, rows, frames,
    palette: palette.map(word), sourceColors: colors.size, quantized: colors.size > (spritePixels ? 3 : 4), tiles, maps };
}

function collectAssets(ast, filename) {
  const hasActor = nodes => nodes.some(node => node.type === 'assign' && node.expression?.type === 'call' && ['actor_sheet','masked_sheet'].includes(node.expression.name) || node.body && hasActor(node.body));
  const activeFont = hasActor(ast) ? require('./actor-font').compactFont(ast,filename) : font;
  const assets = [];
  const calls = new Map();
  const cache = new Map();
  // Different tiles/actor instances/palette bindings can share one BMP decode.
  // Keep this cache local to this compilation so edits are always seen next build.
  const convertedFiles = new Map();
  function convertFile(file,kind,width=8,height=8) {
    const key=JSON.stringify([file,kind,width,height]);
    if(!convertedFiles.has(key))convertedFiles.set(key,convertBMP(fs.readFileSync(file),kind,width,height));
    return convertedFiles.get(key);
  }
  const declarations = new Map();
  const palettes = new Map();
  let bg = 1; let obj = 0;
  const base = filename === '<source>' ? process.cwd() : path.dirname(path.resolve(filename));
  function visit(nodes, top = true) {
    for (const node of nodes) {
        if (node.type === 'assign' && node.expression.type === 'call' && ['scroll_image', 'scene_map', 'masked_sheet', 'screen_image', 'actor_sheet', 'sprite_sheet', 'background_clip', 'tile', 'tilemap', 'mutable_map', 'collision_map', 'worldmap'].includes(node.expression.name)) {
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
        if (call.name === 'masked_sheet') {
          if(call.args.length!==3 || call.args[0].type!=='string' || call.args.slice(1).some(a=>a.type!=='number')) throw new Error(`${location}: masked_sheet requires a literal BMP path, width and height`);
          const file=path.resolve(node.filename ? path.dirname(path.resolve(node.filename)) : base,call.args[0].value);
          const asset=require('./masked-graphics').importSheet(fs.readFileSync(file),call.args[1].value,call.args[2].value,assets.length,file);
          assets.push(asset);calls.set(call,asset);declarations.set(node.name,asset);continue;
        }
        if (['scroll_image','screen_image','scene_map'].includes(call.name)) {
          const scene = call.name === 'scene_map', scroll = call.name === 'scroll_image';
          if (call.args.length < 1 || call.args.length > (scene ? 3 : 2) || call.args[0].type !== 'string') throw new Error(`${location}: ${call.name} expects a literal BMP path`);
          const hudRows = scene ? (call.args[1]?.value ?? 2) : 0;
          const paletteArg=scene?call.args[2]:call.args[1],paletteCount=paletteArg?.value??1;
          if(paletteArg && (paletteArg.type!=='number'||!Number.isInteger(paletteCount)||paletteCount<1||paletteCount>(scene?4:8)))throw Error(`${location}: ${call.name} palettes must be a literal integer 1..${scene?4:8}`);
          if (scene && (call.args[1] && call.args[1].type !== 'number' || !Number.isInteger(hudRows) || hudRows < 1 || hudRows > 6)) throw new Error(`${location}: scene_map hud_rows must be a literal integer 1..6`);
          const sourceBase = node.filename && node.filename !== '<source>' ? path.dirname(path.resolve(node.filename)) : base;
          const file = path.resolve(sourceBase, call.args[0].value);
          const signature = `${scroll ? 'scroll' : scene ? 'scene' : 'screen'}:${hudRows}:${paletteCount}:${file}`;
          if (!cache.has(signature)) {
            let converted;
              try { converted = paletteCount>1?convertIndexedBMP(fs.readFileSync(file),scene?'scene':'background',paletteCount):convertFile(file, scroll ? 'atlas' : scene ? 'scene' : 'background'); }
            catch(error) { throw new Error(`${location}: ${file}: ${error.message}`); }
            if (scroll ? converted.width !== 160 || converted.height < 144 || converted.height > 2040 || converted.tiles.length > 256 : converted.height !== 144 || (scene ? converted.width < 160 || converted.width > 1024 : converted.width !== 160)) throw new Error(`${location}: ${call.name} BMP must be ${scroll ? '160 pixels wide, 144..2040 pixels tall, with at most 256 tile patterns' : scene ? '160..1024x144 pixels' : '160x144 pixels'}`);
            // These patterns replace the ordinary graphics only while this screen
            // is displayed. They are not added to the resident graphics budget.
            const shades = converted.palette.map(color => {
              const r=color&31,g=(color>>5)&31,b=(color>>10)&31;
              return Math.max(0,Math.min(3,Math.round(3-(r*299+g*587+b*114)*3/31000)));
            });
            const asset = {...converted,hudRows,kind:scroll ? 'scroll' : scene ? 'scene' : 'screen',file,paletteIndex:0,id:assets.length,label:`AssetMap${assets.length}`};
            const length=converted.tiles.length*16;
            asset.screenData=[...converted.palette.flatMap(c=>[c&255,c>>8]), shades.reduce((n,v,i)=>n|(v<<(i*2)),0),length&255,length>>8,...converted.tiles.flat(),...converted.maps[0]];
            assets.push(asset);cache.set(signature,asset);
          }
          calls.set(call,cache.get(signature));declarations.set(node.name,cache.get(signature));
          continue;
        }
        const streamed = call.name === 'worldmap';
        if (call.name === 'mutable_map') throw new Error(`${location}: mutable_map requires nested tile rows`);
        const actor = call.name === 'actor_sheet';
        const sprite = call.name === 'sprite_sheet' || actor;
        const clip = call.name === 'background_clip';
        const singleTile = call.name === 'tile';
        let sharedPalette;
        if (clip && call.args.length > 3) {
          const option = call.args[3];
          sharedPalette = option.type === 'keyword' && option.name === 'palette' && option.expression.type === 'name' && declarations.get(option.expression.name);
          if (!sharedPalette || sharedPalette.kind !== 'clip') throw new Error(`${location}: background_clip palette must name a previously declared background clip`);
        }
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
        if (call.args.length < 1 || call.args.length > (singleTile ? 5 : clip ? 4 : sprite ? 3 : streamed ? 2 : 1) || call.args[0].type !== 'string' || (!singleTile && !streamed && call.args.slice(1, clip ? 3 : undefined).some(arg => arg.type !== 'number'))) throw new Error(`${location}: use sprite_sheet("file.bmp", width, height), background_clip("file.bmp", width, height, palette=existing_clip), tilemap("file.bmp"), or tile("file.bmp", solid=True, terrain=1) with literal arguments`);
        const sourceBase = node.filename && node.filename !== '<source>' ? path.dirname(path.resolve(node.filename)) : base;
        const file = path.resolve(sourceBase, call.args[0].value);
        const width = singleTile ? 8 : call.args[1]?.value ?? 8;
        const height = singleTile ? 8 : call.args[2]?.value ?? 8;
        if (clip && (call.args.length < 3 || width > 160 || height > 144)) throw new Error(`${location}: background_clip requires literal width/height fitting 160x144 pixels`);
        const signature = JSON.stringify([file, actor ? node.name : sprite, clip, width, height, singleTile, solid, terrain, streamed, streamed ? call.args[1] : null, tileX, tileY, atlas, sharedPalette ? sharedPalette.paletteIndex : null]);
        if (!cache.has(signature)) {
          const paletteKey = JSON.stringify([file, sprite]);
          if (!sharedPalette && !palettes.has(paletteKey)) palettes.set(paletteKey, sprite ? obj++ : bg++);
          const paletteIndex = sharedPalette ? sharedPalette.paletteIndex : palettes.get(paletteKey);
          if (paletteIndex > 7) throw new Error(`${location}: at most 8 sprite palettes and 7 imported background palettes are available`);
          let converted;
          // Atlas dimensions describe storage, not a hardware background map.
          // A selected tile is reduced to 8x8 immediately below.
          try { converted = convertFile(file, actor ? 'actor' : sprite ? 'sprite' : clip ? 'clip' : singleTile && atlas ? 'atlas' : streamed ? 'world' : 'background', width, height); }
          catch (error) { throw new Error(`${location}: ${file}: ${error.message}`); }
          if (sharedPalette && JSON.stringify(converted.palette) !== JSON.stringify(sharedPalette.palette)) throw new Error(`${location}: clips sharing a palette must import the same colors in the same order`);
          if (actor && (width > 128 || height > 128)) throw new Error(`${location}: actor frames must fit 128x128 pixels`);
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
  const tileData = [...activeFont.bytes];
  const globalTiles = new Map();
  for (let i = 0; i < tileData.length / 16; i++) globalTiles.set(tileData.slice(i * 16, i * 16 + 16).join(','), i);
  for (const asset of assets) {
      if (['collision', 'manual', 'world', 'clip', 'actor', 'scroll', 'screen', 'scene', 'masked'].includes(asset.kind) || (streamedTiles.has(asset) && !residentTiles.has(asset))) continue;
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
  const sharedClips = require('./background-clips').shareClipPatterns(assets,tileData);
  if (assets.some(asset => asset.kind === 'actor') && tileData.length / 16 % 2) tileData.push(...Array(16).fill(0));
  const actors = require('./actors').prepareActors(assets, tileData.length / 16);
  if (actors.enabled && assets.some(asset => asset.kind === 'world')) throw new Error('Actors cannot share a ROM with streamed worlds yet');
  const clips = require('./background-clips').prepareClips(assets, tileData.length / 16 + actors.reservedTiles, sharedClips);
  if (clips.enabled && assets.some(asset => asset.kind === 'world')) throw new Error('Background clips and streamed worlds cannot share a ROM yet');
  const masked = require('./masked-graphics').prepare(assets,tileData);
  const imageFamilies=require('./image-families').prepareImageFamilies(assets);
  const multiPalette=assets.some(a=>a.paletteCount>1);
  if(multiPalette)for(const asset of assets.filter(a=>['scene','screen','scroll'].includes(a.kind))){
    const bytes=asset.tiles.length*16,palettes=asset.palettes||[asset.palette];
    const paletteData=Array.from({length:8},(_,i)=>palettes[i]||palettes[0]).flat().flatMap(c=>[c&255,c>>8]);
    const dmg=asset.dmgPalette??asset.screenData[8];
    asset.screenData=[...paletteData,dmg,bytes&255,bytes>>8,...asset.tiles.flat(),...asset.maps[0],...(asset.attributes||asset.maps[0].map(()=>0))];
  }
  const scenes = assets.filter(a=>a.kind==='scene');
  if (new Set(scenes.map(a=>a.hudRows)).size>1) throw new Error('All scene_map declarations in a ROM must use the same hud_rows');
  if (scenes.length && !masked.enabled) throw new Error('scene_map currently requires masked_sheet composition');
  for (const scene of scenes) {
    const local=[], remap=scene.tiles.map(tile=>{
      const key=tile.join(',');
      if(globalTiles.has(key)) return globalTiles.get(key);
      local.push(tile);return tileData.length/16+local.length-1;
    });
    if(tileData.length/16+local.length>128) throw new Error(`${scene.file}: scene_map needs ${local.length} scene patterns plus ${tileData.length/16} resident patterns; maximum is 128`);
    const bytes=local.length*16;
    scene.scenePatterns=local.length;
    scene.sceneTileBase=tileData.length/16;
    const dmg=scene.palette.reduce((n,c,i)=>n|(Math.max(0,Math.min(3,Math.round(3-((c&31)*299+((c>>5)&31)*587+((c>>10)&31)*114)*3/31000)))<<(i*2)),0);
    scene.sceneData=multiPalette?[...scene.screenData.slice(0,64),scene.dmgPalette??dmg,bytes&255,bytes>>8,...local.flat(),...scene.maps[0].map(id=>remap[id]),...(scene.attributes||scene.maps[0].map(()=>0))]:[...scene.palette.flatMap(c=>[c&255,c>>8]),dmg,bytes&255,bytes>>8,...local.flat(),...scene.maps[0].map(id=>remap[id])];
    delete scene.screenData;
  }
  if(imageFamilies)for(const asset of assets.filter(a=>['screen','scroll'].includes(a.kind))){
    const bytes=asset.tiles.length*16,palettes=asset.palettes||[asset.palette];
    const paletteData=Array.from({length:multiPalette?8:1},(_,i)=>palettes[i]||palettes[0]).flat().flatMap(c=>[c&255,c>>8]);
    const dmg=asset.dmgPalette??asset.screenData[multiPalette?64:8];
    asset.screenData=[asset.imageFamily||0,...paletteData,dmg,bytes&255,bytes>>8,...asset.tiles.flat(),...asset.maps[0],...(multiPalette?(asset.attributes||asset.maps[0].map(()=>0)):[])];
  }
  return { imageFamilies, masked:masked.enabled, assets, calls, tileData, font: activeFont, worldObjects: [...worldObjects, ...clips.objects, ...actors.objects, ...masked.objects], clips, actors,
    streaming: assets.some(asset => asset.kind === 'world'), scrolling: assets.some(asset => asset.kind === 'world') };
}

function parseColor(node) {
  if (node.type === 'number' && Number.isInteger(node.value) && node.value >= 0 && node.value <= 32767) return node.value;
  if (node.type === 'string' && /^#[0-9a-f]{6}$/i.test(node.value)) return word(color15([1, 3, 5].map(offset => parseInt(node.value.slice(offset, offset + 2), 16))));
  throw new Error(`${node.filename ? node.filename + ': ' : ''}Line ${node.line}: palette colors must be "#RRGGBB" strings or 0..32767 RGB15 integer literals`);
}

module.exports = { decodeBMP, convertBMP, convertIndexedBMP, collectAssets, parseColor };
