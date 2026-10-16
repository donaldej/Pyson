'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {root,emulatorPython}=require('../scripts/environment');
test('field composition and tile grids match visible tile IDs on both models',{skip:!fs.existsSync(emulatorPython())},()=>{
 const directory=path.join(root,'build/tests/tile-fields-runtime');fs.mkdirSync(directory,{recursive:true});
 const brick=path.join(root,'examples/star-chase/assets/brick.bmp').replaceAll('\\','/');
 const floor=path.join(root,'examples/star-chase/assets/floor.bmp').replaceAll('\\','/');
 let source='header.target="dual"\nheader.controller="mbc5"\nheader.cpu_speed="double"\n';
 // Reach the upper half of the descriptor table, where 8-bit index math can fail.
 for(let i=0;i<129;i++)source+=`t${i}=tile("${brick}",terrain=${i})\n`;
 source+=`bright=tile("${floor}")
tiles=[t128,bright]
columns=constant_table([-1,0,1,2])
rows=constant_table([0,1])
cells=[bright,t128,bright,-1]
romcells=constant_table([129,128,129,-1])
romtiles=constant_table([128,129])
stage=0
def show(c,r,t,g):
    draw_tile_field(columns=c,rows=r,tiles=t,x=1,y=1)
    draw_tile_grid(g,2,1,5)
show(columns,rows,tiles,cells)
draw_tile_grid(romcells,2,10,5)
draw_tile_field(columns,rows,romtiles,5,9)
draw_tile_field(columns,rows,tiles,18,17)
refresh_screen()
stage=1
wait_frames(20)
empty=[]
draw_tile_field(empty,rows,tiles)
draw_tile_grid(cells,0)
stage=2
while True:
    wait_frames(1)
`;
 // Runtime zero-width case must use a variable rather than an invalid literal.
 source=source.replace('draw_tile_grid(cells,0)','zero=0\ndraw_tile_grid(cells,zero)');
 fs.writeFileSync(path.join(directory,'main.pysn'),source);
 const build=spawnSync(process.execPath,['src/cli.js',path.join(directory,'main.pysn'),'tile-fields-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(build.status,0,build.error?.message||build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/tile-fields.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);console.log(run.stdout.trim());
});
