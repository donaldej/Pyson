'use strict';
const fs=require('node:fs'),path=require('node:path');
function fixture(){
 const dir=path.resolve(__dirname,'../build/tests/masked-renderer');fs.mkdirSync(dir,{recursive:true});
 const w=48,h=16,b=Buffer.alloc(54+w*h*4);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(32,28);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const f=Math.floor(x/16),xx=x%16,visible=f===0?(xx+y)%3!==0:f===1?xx>=y:false,c=[255,170,85,0][(xx+2*y)%4],i=54+((h-1-y)*w+x)*4;b[i]=b[i+1]=b[i+2]=c;b[i+3]=visible?255:0;}
 fs.writeFileSync(path.join(dir,'sheet.bmp'),b);
 const big=Buffer.alloc(54+128*128*4);b.copy(big,0,0,54);big.writeUInt32LE(big.length,2);big.writeInt32LE(128,18);big.writeInt32LE(128,22);for(let i=54;i<big.length;i+=4){big[i]=big[i+1]=big[i+2]=255;big[i+3]=255;}fs.writeFileSync(path.join(dir,'big.bmp'),big);
 fs.writeFileSync(path.join(dir,'still.bmp'),require('./screen-images-fixture').bmp(160,144,()=>255));
 return {dir,b,filename:path.join(dir,'main.pysn'),source:`header.controller="mbc5"
header.target="dual"
a=masked_sheet("sheet.bmp",16,16)
big=masked_sheet("big.bmp",128,128)
still=screen_image("still.bmp")
x=19
y=23
flip=False
pose=0
hidden=False
clip_top=0
ready=0
overflow=False
extra=False
clear_screen()
bg_palette(0,"#FFFFFF","#AAAAAA","#555555","#000000")
while True:
    if button("a"):
        clear_screen()
    if button("b"):
        show_image(still)
    draw_masked(0,a,pose,x,y,flip_x=flip,clip_top=clip_top)
    draw_masked(1,a,1,23,27,True)
    if extra:
        draw_masked(2,a,0,51,41)
        draw_masked(3,a,1,54,45)
        # Slot four is invalid and must preserve all retained layers.
        draw_masked(4,big,0,0,0)
    else:
        hide_masked(2)
        hide_masked(3)
    if overflow:
        draw_masked(0,big,0,0,0)
        hide_masked(1)
    if hidden:
        hide_masked(0)
    refresh_screen()
    ready += 1
    wait_frames(1)
`};
}
module.exports={fixture};
