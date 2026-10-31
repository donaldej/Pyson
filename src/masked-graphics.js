'use strict';
const state=`wMaskedCacheReady: ds 1
wMaskedRowsLeft: ds 1
wMaskedFrameBank: ds 2
wMaskedFramePointer: ds 2
wMaskedX: ds 1
wMaskedY: ds 2
wMaskedHeight: ds 1
wMaskedChunk: ds 1
wMaskedNew: ds 14
wMaskedBase: ds 576
wMaskedActors: ds 56
wMaskedFront: ds 1
wMaskedPending: ds 1
wMaskedDirty: ds 1
wMaskedOverflow: ds 1
wMaskedColumn: ds 1
wMaskedCount: ds 1
wMaskedIndex: ds 2
wMaskedState: ds 2
wMaskedLine: ds 1
wMaskedSource: ds 2
wMaskedDest: ds 2
wMaskedLeft: ds 3
wMaskedPalette: ds 1
wMaskedClipTop: ds 1`;
function importSheet(data,width,height,id,file){
 const image=require('./assets').decodeBMP(data);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||width>128||height<8||height>128||width%8||image.width%width||image.height%height)throw Error('masked_sheet dimensions must divide the BMP; width must be a multiple of eight, frames fit 128x128');
 if(!image.alpha)throw Error('masked_sheet requires a 32-bit BMP with an explicit alpha mask');
 const colors=[...new Set(image.pixels.filter(p=>p[3]>=128).map(p=>p.slice(0,3).join(',')))].map(s=>s.split(',').map(Number)).sort((a,b)=>b.reduce((s,v)=>s+v,0)-a.reduce((s,v)=>s+v,0));
 if(colors.length>4)throw Error('masked_sheet supports four opaque colors plus transparency; source pixels will not be reduced');
 const colorMap=new Map(colors.map((c,i)=>[c.join(','),i]));
 const frames=image.width/width*(image.height/height);if(frames>255)throw Error('masked_sheet supports at most 255 frames');
 const payload=[];
 for(let f=0;f<frames;f++)for(let flip=0;flip<2;flip++)for(let shift=0;shift<8;shift++){
  const rows=[];
  for(let y=0;y<height;y++){
   const cells=[];
   for(let x=0;x<width;x+=8){let mask=0,lo=0,hi=0;for(let bit=0;bit<8;bit++){
    const px=flip?width-1-x-bit:x+bit,p=image.pixels[(Math.floor(f/(image.width/width))*height+y)*image.width+(f%(image.width/width))*width+px];
    if(p[3]>=128){const c=colorMap.get(p.slice(0,3).join(',')),flag=128>>bit;mask|=flag;if(c&1)lo|=flag;if(c&2)hi|=flag;}
   }cells.push([mask,lo,hi]);}cells.push([0,0,0]);
   const aligned=cells.map((c,i)=>c.map((v,j)=>(v>>shift)|((i?cells[i-1][j]:0)<<(8-shift)&255)));
   const first=aligned.findIndex(c=>c[0]),last=aligned.length-1-[...aligned].reverse().findIndex(c=>c[0]);
   rows.push(first<0?[255,0,0]:[first,last-first+1,0,...aligned.slice(first,last+1).flat()]);
  }payload.push(rows);
 }
 return {kind:'masked',id,label:`AssetMap${id}`,file,columns:width/8,rows:height,frames,paletteIndex:0,tiles:[],maps:[],payload,sourceColors:colors.length,quantized:false};
}
function prepare(assets,tileData){
 const sheets=assets.filter(a=>a.kind==='masked');if(!sheets.length)return {enabled:false,objects:[]};
 if(tileData.length>128*16)throw Error('Masked composition reserves 128 resident tiles; simplify the scenery or font');
 if(assets.some(a=>['actor','clip','world'].includes(a.kind)))throw Error('Masked composition cannot be combined with actors, background clips or streamed worlds');
 const objects=[],variants=new Map();
 for(const a of sheets){a.romBytes=a.payload.length*4; a.payload.forEach((rows,i)=>{
   const first=rows.findIndex(row=>row[0]!==255);
   const top=first<0?0:first,last=first<0?-1:rows.findLastIndex(row=>row[0]!==255);
   const trimmed=first<0?[]:rows.slice(top,last+1);
   const signature=top+'|'+trimmed.map(row=>row.join(',')).join(';');
   a.variantLabels ||= [];
   if(variants.has(signature)){a.variantLabels.push(variants.get(signature));return;}
   const label=`Masked${a.id}Frame${i}`,data=[],uniqueRows=new Map();let offset=2+trimmed.length*2;
   variants.set(signature,label);a.variantLabels.push(label);
   // The reader follows a pointer for every scanline. Repeated scanlines can
   // share their bytes, including the transparent padding around a small pose.
   // Keep the row pointer table intact: this needs no runtime format change.
   const pointers=trimmed.map(row=>{
    const key=row.join(',');let value=uniqueRows.get(key);
    if(value===undefined){value=offset;uniqueRows.set(key,value);offset+=row.length;data.push(...row);}
    return `    dw ${label} + ${value}`;
   });
   a.romBytes+=data.length+2+trimmed.length*2; objects.push({label,bytes:data.length+2+trimmed.length*2,body:`${label}:\n    db ${top}, ${trimmed.length}\n`+pointers.join('\n')+(data.length?`\n    db ${data.join(', ')}`:'')});
  });
  const label=a.label;objects.push({label,asset:a,bytes:a.payload.length*4,body:`${label}:\n`+a.variantLabels.map(label=>`    dw ${label}, BANK(${label})`).join('\n')});delete a.payload;
 }
 return {enabled:true,objects};
}
const tintState=`wTintPalettes: ds 4
wTintEnabled: ds 1
wTintLayer: ds 1
wTintSavedSP: ds 2
wTintCount: ds 1
wTintLayerIndex: ds 1
wTintBand: ds 1
wTintColumn: ds 1
wTintFirstColumn: ds 1
wTintLastColumn: ds 1
wTintLastBand: ds 1
wTintOwnerBase: ds 1
wTintStage: ds 2
wTintMap: ds 2
wTintAny: ds 1
wTintMask: ds 1
wTintLow: ds 1
wTintHigh: ds 1
wTintRows: ds 1
wTintPalette: ds 1
wTintBase: ds 1
wTintScan: ds 9`;
const cacheState=`wTintCacheValid: ds 12
wTintCacheNext: ds 4
wTintCacheLastXY: ds 16
wTintCachePositionValid: ds 4
wTintCacheGeneration: ds 12
wTintTagReady: ds 1
wTintCacheEntry: ds 1
wTintCacheBank: ds 1
wTintCacheBase: ds 2
wTintCacheStart: ds 1
wTintCacheMode: ds 1
wTintCacheLength: ds 1
wTintCacheLocal: ds 1
wTintCacheRead: ds 2
wTintCacheWrite: ds 2
wTintUploadSlot: ds 1
wTintUploadEnd: ds 1
wTintCacheHits: ds 2
wTintCacheMisses: ds 2
wTintUploadBlocks: ds 2`;
module.exports={importSheet,prepare,state,tintState,cacheState};
