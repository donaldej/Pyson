"use strict";
// Small map-only changes can share one tile numbering scheme. Keep palette,
// geometry and almost every cell identical; unrelated pictures stay transitions.
function prepareImageFamilies(assets) {
  const groups=[];
  for (const a of assets.filter(a=>a.kind==='screen')) {
    const colors=JSON.stringify(a.palettes||[a.palette]);
    const cells=a.maps[0].map(id=>a.tiles[id].join(','));
    let group=groups.find(g=>g.colors===colors&&g.width===a.width&&g.height===a.height&&
      cells.length===g.cells.length&&cells.reduce((n,c,i)=>n+(c!==g.cells[i]),0)<=8&&
      new Set([...g.patterns.keys(),...cells]).size<=256);
    if(!group){group={colors,width:a.width,height:a.height,cells,patterns:new Map(),assets:[]};groups.push(group);}
    for(const tile of a.tiles)group.patterns.set(tile.join(','),tile);
    group.assets.push(a);
  }
  let family=0;
  for(const g of groups.filter(g=>g.assets.length>1)){
    const tiles=[...g.patterns.values()],ids=new Map(tiles.map((t,i)=>[t.join(','),i]));
    for(const a of g.assets){a.maps=[a.maps[0].map(i=>ids.get(a.tiles[i].join(',')))];a.tiles=tiles;a.imageFamily=family+1;}
    family++;
  }
  return family;
}
module.exports={prepareImageFamilies};
