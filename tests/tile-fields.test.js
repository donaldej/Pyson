'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { root } = require('../scripts/environment');
const directory = path.join(root, 'build/tests/tile-fields');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'main.pysn');
const brick = path.join(root, 'examples/star-chase/assets/brick.bmp').replaceAll('\\','/');
const floor = path.join(root, 'examples/star-chase/assets/floor.bmp').replaceAll('\\','/');
const setup = `dark = tile("${brick}")\nlight = tile("${floor}")\ntiles = [dark,light]\ncolumns = constant_table([-1,0,1,2])\nrows = [0,1]\ncells = [dark,light,light,dark]\n`;
test('tile grids and separable fields compile RAM, ROM and helper arrays with named arguments', () => {
  const result = compile(setup + `def show(c,r,t,g):
    draw_tile_grid(g,columns=2,x=2,y=5)
    draw_tile_field(tiles=t,rows=r,columns=c,y=1,x=1)
show(columns,rows,tiles,cells)
refresh_screen()`,file);
  assert.match(result.assembly, /DEF TILE_FIELD_ENABLED EQU 1/);
  assert.match(result.assembly, /call DrawTileGrid/);
  assert.match(result.assembly, /call DrawTileField/);
  assert.ok(result.symbols.find(v=>v.name==='c'&&v.type==='array').romReference);
  assert.equal(result.assets.length,2);
});
test('field and grid validation rejects unsafe types, dimensions and tile-list sizes',()=>{
  for(const code of [
    'draw_tile_grid(5,2)', 'draw_tile_grid(cells,0)', 'draw_tile_grid(cells,33)',
    'draw_tile_grid(cells,2,x=20)', 'draw_tile_field(columns,rows,5)',
    'bad = [dark,light,dark]\ndraw_tile_field(columns,rows,bad)',
    'draw_tile_field(columns,rows,tiles,y=-1)',
    'draw_tile_field(columns,rows,tiles,x=20)'
  ]) assert.throws(()=>compile(setup+code,file),/array|integer|columns|coordinates|power|screen/i,code);
});
