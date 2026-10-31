'use strict';
const fs=require('node:fs'),path=require('node:path');
function fixture() {
  const directory=path.resolve(__dirname,'../build/tests/actors-'+process.pid);fs.mkdirSync(directory,{recursive:true});
  const w=48,h=16,data=Buffer.alloc(54+w*h*4);
  data.write('BM');data.writeUInt32LE(data.length,2);data.writeUInt32LE(54,10);data.writeUInt32LE(40,14);
  data.writeInt32LE(w,18);data.writeInt32LE(h,22);data.writeUInt16LE(1,26);data.writeUInt16LE(32,28);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const frame=Math.floor(x/16),local=x%16;
    const visible=frame===0 ? local<8&&y<8&&local>=y : frame===1 ? (local+y)%3!==0 : false;
    const color=(local+y)%2 ? 255 : 100,at=54+((h-1-y)*w+x)*4;
    data[at]=data[at+1]=data[at+2]=color;data[at+3]=visible?255:0;
  }
  fs.writeFileSync(path.join(directory,'actor.bmp'),data);
  const largeData=Buffer.alloc(54+32*32*4);data.copy(largeData,0,0,54);
  largeData.writeUInt32LE(largeData.length,2);largeData.writeInt32LE(32,18);largeData.writeInt32LE(32,22);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const at=54+((31-y)*32+x)*4;
    const visible=(x>=3&&x<11&&y>=5&&y<21)||(x===0&&y===0);
    const color=(x+y)%3===0?100:255;
    largeData[at]=largeData[at+1]=largeData[at+2]=color;largeData[at+3]=visible?255:0;
  }
  fs.writeFileSync(path.join(directory,'large.bmp'),largeData);
  return {directory,data,largeData,filename:path.join(directory,'main.pysn')};
}
module.exports={fixture};
