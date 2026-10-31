'use strict';
const {fixture}=require('./masked-graphics-fixture');const fs=require('node:fs');
function colorFixture(){
 const f=fixture();const b=Buffer.alloc(54+64*64*4);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(64,18);b.writeInt32LE(64,22);b.writeUInt16LE(1,26);b.writeUInt16LE(32,28);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=54+((63-y)*64+x)*4,c=[255,170,85,0][(x+2*y)%4];b[i]=b[i+1]=b[i+2]=c;b[i+3]=255;}fs.writeFileSync(f.dir+'/wide.bmp',b);
 let source=f.source.replace('while True:',`wide=masked_sheet("wide.bmp",64,64)
budget=False
palette_slot0=1
palette_slot1=2
sprite_palette(palette_slot0,"#FFFFFF","#F83838","#982020","#380808")
sprite_palette(palette_slot1,"#FFFFFF","#38F838","#209820","#083808")
color0=1
color1=2
color_hardware=is_cgb()
palette_zero_black=False
palette_zero_old=False
while True:
    if palette_zero_black!=palette_zero_old:
        if palette_zero_black:
            sprite_palette(palette_slot0,"#000000","#F83838","#982020","#380808")
        else:
            sprite_palette(palette_slot0,"#FFFFFF","#F83838","#982020","#380808")
        palette_zero_old=palette_zero_black
    masked_palette(slot=0,index=color0)
    masked_palette(slot=1,index=color1)`);
 const begin=source.indexOf('    draw_masked(0,a,pose'),end=source.indexOf('    refresh_screen()',begin),ordinary=source.slice(begin,end).trimEnd();
 source=source.slice(0,begin)+'    if not budget:\n'+ordinary.split('\n').map(line=>'    '+line).join('\n')+`\n    else:
        draw_masked(0,wide,0,0,32)
        draw_masked(1,wide,0,64,32)
        hide_masked(2)
        hide_masked(3)
`+source.slice(end);
 return {...f,filename:f.dir+'/color.pysn',source};
}
module.exports={colorFixture};
