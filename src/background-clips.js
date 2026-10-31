'use strict';

// Each frame is a contiguous bank object: count, local patterns, then layout.
// Two disjoint VRAM ranges keep pattern uploads off the currently visible frame.
function shareClipPatterns(assets,tileData) {
  const clips=assets.filter(asset=>asset.kind==='clip');
  const frames=clips.reduce((sum,clip)=>sum+clip.maps.length,0);
  const base=tileData.length/16;
  if(frames<4)return {base,count:0,indices:new Map()};
  const frequency=new Map(),patterns=new Map(), framePatterns=[];
  for(const clip of clips){
    const keys=clip.tiles.map(tile=>tile.join(','));
    for(const map of clip.maps){
      const unique=new Set(map.map(id=>keys[id]));
      framePatterns.push(unique);
      for(const key of unique)frequency.set(key,(frequency.get(key)||0)+1);
    }
    clip.tiles.forEach((tile,id)=>patterns.set(keys[id],tile));
  }
  let common=[...frequency].filter(([,count])=>count>=Math.ceil(frames*.9))
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,64);
  if(common.length<8)common=[];
  // A pattern kept resident costs one slot but can save a slot in BOTH buffers.
  // Look beyond frequency alone: promote patterns used by the largest frames.
  // Keep the best layout encountered, so exploration can never increase VRAM.
  const chosen=common.map(([key])=>key), selected=new Set(chosen);
  const counts=framePatterns.map(set=>[...set].filter(key=>!selected.has(key)).length);
  const aligned=count=>assets.some(asset=>asset.kind==='actor')?Math.ceil(count/2)*2:count;
  const cost=()=>aligned(base+chosen.length)+2*Math.max(...counts);
  let best=chosen.slice(), bestCost=cost();
  while(chosen.length<64){
    const peak=Math.max(...counts);
    if(!peak)break;
    const coverage=new Map();
    framePatterns.forEach((set,index)=>{
      if(counts[index]===peak)for(const key of set)if(!selected.has(key))coverage.set(key,(coverage.get(key)||0)+1);
    });
    const candidates=[...coverage].sort((a,b)=>b[1]-a[1]||frequency.get(b[0])-frequency.get(a[0])||a[0].localeCompare(b[0]));
    if(!candidates.length)break;
    const key=candidates[0][0];chosen.push(key);selected.add(key);
    framePatterns.forEach((set,index)=>{if(set.has(key))counts[index]--;});
    if(cost()<bestCost){best=chosen.slice();bestCost=cost();}
  }
  common=best.map(key=>[key,frequency.get(key)]);
  if(!common.length)return {base,count:0,indices:new Map()};
  const indices=new Map(common.map(([key],index)=>[key,index]));
  for(const [key] of common)tileData.push(...patterns.get(key));
  return {base,count:common.length,indices};
}

function prepareClips(assets, residentTiles, shared={base:0,count:0,indices:new Map()}) {
  const clips = assets.filter(asset => asset.kind === 'clip');
  const objects = [];
  let span = 0;
  for (const clip of clips) {
    clip.clipFrames = clip.maps.map((map, index) => {
      const ids = [...new Set(map)].filter(id=>!shared.indices.has(clip.tiles[id].join(',')));
      if (ids.length + shared.count > 256 || ids.length > 255) throw new Error(`${clip.file}: background clip frame ${index} has more than 255 patterns`);
      const remap = new Map(ids.map((id, i) => [id, i]));
      span = Math.max(span, ids.length);
      const data = [ids.length, ...ids.flatMap(id => clip.tiles[id]), ...map.map(id => {
        const persistent=shared.indices.get(clip.tiles[id].join(','));
        return persistent===undefined?remap.get(id):ids.length+persistent;
      })];
      const label = `${clip.label}Frame${index}`;
      objects.push({ label, kind: 'background-frame', bytes: data.length,
        body: `${label}:\n    db ${data.join(', ')}\n` });
      return { label, tiles: ids.length };
    });
    objects.push({ label: clip.label, kind: 'background-index', bytes: clip.frames * 4, asset: clip,
      body: `${clip.label}:\n` + clip.clipFrames.map(frame => `    dw ${frame.label}, BANK(${frame.label})`).join('\n') });
    clip.clip = { residentBase: residentTiles, patternsPerBuffer: 0, sharedBase:shared.base,sharedSlots:shared.count,
      peakFramePatterns: Math.max(...clip.clipFrames.map(frame => frame.tiles)) };
  }
  if (clips.length && residentTiles + span * 2 > 256) {
    throw new Error(`Background clips need two buffers of ${span} patterns plus ${residentTiles} resident tiles; reduce each frame to at most ${Math.floor((256 - residentTiles) / 2)} unique patterns`);
  }
  for (const clip of clips) clip.clip.patternsPerBuffer = span;
  return { objects, enabled: Boolean(clips.length), base: residentTiles, span, sharedBase:shared.base, sharedCount:shared.count };
}
module.exports = { prepareClips, shareClipPatterns };
