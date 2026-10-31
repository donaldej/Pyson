'use strict';

// Each declared actor owns two pattern buffers and a disjoint OAM range.
// Empty image cells have no component, so large transparent canvases are cheap.
function prepareActors(assets, residentTiles) {
  const actors = assets.filter(asset => asset.kind === 'actor');
  // The hardware size is global. Use tall components only when every actor
  // canvas fits and there are no ordinary 8x8 sprite sheets to conflict with.
  const componentHeight = actors.length && !assets.some(asset => asset.kind === 'sprite') && actors.every(actor => actor.frameHeight % 16 === 0) ? 16 : 8;
  const objects = [];
  let base = residentTiles, slots = 40;
  for (const actor of actors) {
    let span = 0, components = 0;
    actor.actorFrames = actor.maps.map((map, index) => {
      const width=actor.frameWidth,height=actor.frameHeight;
      const pixels=new Uint8Array(width*height);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const tile=actor.tiles[map[Math.floor(y/8)*actor.columns+Math.floor(x/8)]];
        const bit=7-x%8,row=y%8*2;
        pixels[y*width+x]=((tile[row]>>bit)&1)|(((tile[row+1]>>bit)&1)<<1);
      }
      let packed;
      // A different invisible padding alignment can save many components.
      // Actual opaque pixels retain their exact original canvas coordinates.
      const optimize=width>16||height>16;
      for(let sy=0;sy<(optimize?componentHeight:1);sy++)for(let sx=0;sx<(optimize?8:1);sx++){
        const candidate={cells:[],patterns:[],sx,sy},lookup=new Map();
        for(let y=-sy;y<height;y+=componentHeight)for(let x=-sx;x<width;x+=8){
          const bytes=[];let nonzero=false;
          for(let dy=0;dy<componentHeight;dy++){
            let lo=0,hi=0;
            for(let dx=0;dx<8;dx++){
              const xx=x+dx,yy=y+dy;
              const pixel=xx>=0&&xx<width&&yy>=0&&yy<height?pixels[yy*width+xx]:0;
              lo|=(pixel&1)<<(7-dx);hi|=(pixel>>1)<<(7-dx);
            }
            bytes.push(lo,hi);nonzero ||= Boolean(lo|hi);
          }
          if(!nonzero)continue;
          const key=bytes.join(',');
          if(!lookup.has(key)){lookup.set(key,candidate.patterns.length);candidate.patterns.push(bytes);}
          candidate.cells.push({id:lookup.get(key),x,y});
        }
        const scan=new Uint8Array(height+componentHeight*2);
        for(const cell of candidate.cells)for(let line=cell.y;line<cell.y+componentHeight;line++)scan[line+componentHeight]++;
        candidate.peak=Math.max(...scan);
        if(!packed||candidate.peak<packed.peak||candidate.peak===packed.peak&&(candidate.cells.length<packed.cells.length||candidate.cells.length===packed.cells.length&&candidate.patterns.length<packed.patterns.length))packed=candidate;
      }
      // Limbs do not all begin on one horizontal grid. Independently aligning
      // each column avoids tall transparent padding consuming scanline slots.
      if(optimize)for(let pad=0;pad<componentHeight;pad++)for(let sx=0;sx<8;sx++){
        const candidate={cells:[],patterns:[],sx,sy:pad,packing:'columns'},lookup=new Map();
        for(let x=-sx;x<width;x+=8){
          const occupied=[];
          for(let y=0;y<height;y++)for(let dx=0;dx<8;dx++)if(x+dx>=0&&x+dx<width&&pixels[y*width+x+dx]){occupied.push(y);break;}
          let i=0,boundary=-componentHeight;
          while(i<occupied.length){
            const y=Math.max(boundary,occupied[i]-pad),bytes=[];
            for(let dy=0;dy<componentHeight;dy++){
              let lo=0,hi=0;
              for(let dx=0;dx<8;dx++){
                const xx=x+dx,yy=y+dy,pixel=xx>=0&&xx<width&&yy>=0&&yy<height?pixels[yy*width+xx]:0;
                lo|=(pixel&1)<<(7-dx);hi|=(pixel>>1)<<(7-dx);
              }
              bytes.push(lo,hi);
            }
            const key=bytes.join(',');
            if(!lookup.has(key)){lookup.set(key,candidate.patterns.length);candidate.patterns.push(bytes);}
            candidate.cells.push({id:lookup.get(key),x,y});boundary=y+componentHeight;
            while(i<occupied.length&&occupied[i]<boundary)i++;
          }
        }
        const scan=new Uint8Array(height+componentHeight*2);
        for(const cell of candidate.cells)for(let line=cell.y;line<cell.y+componentHeight;line++)scan[line+componentHeight]++;
        candidate.peak=Math.max(...scan);
        if(candidate.peak<packed.peak||candidate.peak===packed.peak&&(candidate.cells.length<packed.cells.length||candidate.cells.length===packed.cells.length&&candidate.patterns.length<packed.patterns.length))packed=candidate;
      }
      const {cells,patterns}=packed;
      if (cells.length > 40) throw new Error(`${actor.file}: actor frame ${index} uses ${cells.length} nonempty components; at most 40 are supported`);
      const tileCount=patterns.length*componentHeight/8;
      span = Math.max(span, tileCount); components = Math.max(components, cells.length);
      const data = [tileCount, ...patterns.flat(), cells.length,
        ...cells.flatMap(cell => [cell.x&255,cell.y&255,cell.id*componentHeight/8])];
      const label = `${actor.label}ActorFrame${index}`;
      objects.push({label, kind:'actor-frame', bytes:data.length, body:`${label}:\n    db ${data.join(', ')}\n`});
      return {label, tiles:tileCount, components:cells.length,gridShift:[packed.sx,packed.sy],peakScanline:packed.peak,packing:packed.packing||'grid'};
    });
    // One blank slot is enough for an entirely transparent actor.
    span = Math.max(1,span); slots -= components;
    if (slots < 0) throw new Error('Declared actors reserve more than 40 hardware sprite components; reduce their largest poses');
    actor.actor = {tileBase:base, patternsPerBuffer:span, reservedTiles:span*2, firstSprite:slots, reservedSprites:components,componentHeight};
    base += span * 2;
    objects.push({label:actor.label,kind:'actor-index',bytes:actor.frames*4,asset:actor,
      body:`${actor.label}:\n`+actor.actorFrames.map(frame=>`    dw ${frame.label}, BANK(${frame.label})`).join('\n')});
  }
  if (base > 256) throw new Error(`Actors need ${base-residentTiles} buffered tile slots plus ${residentTiles} resident tiles; reduce pose detail or resident artwork`);
  return {enabled:actors.length>0,objects,reservedTiles:base-residentTiles,firstSprite:slots,componentHeight};
}
module.exports = {prepareActors};
