'use strict';
const fs=require('fs'),path=require('path');
const palettes=[['#101824','#56708C','#A0BCC8','#F0E8D0'],['#201414','#885048','#CCA078','#FFF0C8'],['#101C18','#407058','#90B898','#E0F0C8'],['#201420','#785080','#B8A0C8','#F8E0F8'],['#141428','#4058A0','#9098D8','#E0E8FF'],['#201810','#907030','#D0B050','#FFF0A0'],['#102020','#287C88','#78C8D0','#D8FFFF'],['#201018','#984860','#DC98B0','#FFE0E8']].map(p=>p.map(s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16))));
function bmp(width,height,count,groups=(x,y)=>((x>>3)+(y>>3))%count){
 const stride=(width+3)&~3,offset=54+count*16,b=Buffer.alloc(offset+stride*height);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(offset,10);b.writeUInt32LE(40,14);b.writeInt32LE(width,18);b.writeInt32LE(height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(8,28);b.writeUInt32LE(count*4,46);
 for(let p=0;p<count;p++)for(let c=0;c<4;c++){const i=54+(p*4+c)*4;[b[i+2],b[i+1],b[i]]=palettes[p][c];}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)b[offset+(height-1-y)*stride+x]=groups(x,y)*4+(x+y)%4;
 return b;
}
function fixture(){const dir=path.resolve(__dirname,'../build/tests/indexed-colors');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/arena.bmp',bmp(168,144,3));fs.writeFileSync(dir+'/screen.bmp',bmp(160,144,8));const gray=require('./screen-images-fixture').bmp;fs.writeFileSync(dir+'/plain.bmp',gray(160,144,(x,y)=>[255,170,85,0][(x+y)%4]));fs.writeFileSync(dir+'/credits.bmp',gray(160,200,(x,y)=>[255,170,85,0][(x+y)%4]));const masked=require('./masked-graphics-fixture').fixture();fs.copyFileSync(masked.dir+'/sheet.bmp',dir+'/sheet.bmp');
 const source=`header.target="dual"
header.controller="mbc5"
arena=scene_map("arena.bmp",hud_rows=3,palettes=3)
picture=screen_image("screen.bmp",palettes=8)
plain=screen_image("plain.bmp")
credits=scroll_image("credits.bmp")
sheet=masked_sheet("sheet.bmp",16,16)
request=0
completed=-1
camera=0
position=0
ready=0
while True:
    if request!=completed:
        if request==1:
            show_image(picture)
        elif request==2:
            show_image(plain)
        elif request==3:
            show_scroll(credits,position)
        else:
            clear_screen()
            draw_scene(arena,camera)
        completed=request
    refresh_screen()
    ready+=1
`;
 fs.writeFileSync(dir+'/main.pysn',source);return {dir,source,filename:dir+'/main.pysn'};}
module.exports={bmp,palettes,fixture};
