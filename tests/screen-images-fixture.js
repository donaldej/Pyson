'use strict';
function bmp(w,h,fn){
 const stride=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+stride*h);b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=fn(x,y),o=54+(h-1-y)*stride+x*3;b[o]=b[o+1]=b[o+2]=c;}return b;
}

module.exports={bmp};
