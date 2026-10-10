'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { convertBMP } = require('../src/assets');
try {
  const [input, output, kind = 'sprite', width = '8', height = '8'] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: npm run convert:bmp -- input.bmp output-prefix [sprite|background] [frame-width] [frame-height]');
  const result = convertBMP(fs.readFileSync(input), kind, Number(width), Number(height));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output + '.2bpp', Buffer.from(result.tiles.flat()));
  fs.writeFileSync(output + '.map', Buffer.from(result.maps.flat()));
  const palette = Buffer.alloc(8);
  result.palette.forEach((color, i) => palette.writeUInt16LE(color, i * 2));
  fs.writeFileSync(output + '.pal', palette);
  const { tiles, maps, ...metadata } = result;
  fs.writeFileSync(output + '.json', JSON.stringify({ ...metadata, tileCount: tiles.length, maps }, null, 2));
  console.log(`Converted ${result.frames} frame(s), ${tiles.length} tiles${result.quantized ? ' (colors quantized)' : ''}: ${output}.{2bpp,map,pal,json}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
