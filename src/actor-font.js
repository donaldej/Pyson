'use strict';
const path=require('node:path');
const font=require('./font');
const dialogueNames=new Set(require('./dialogue-codegen').names);

// Actor programs benefit from omitting glyphs they cannot print. All text in
// Pyson originates in literals, numeric formatting, or these runtime messages.
// The map is local to a compilation: ordinary programs retain the full font.
function compactFont(ast,filename){
  const foldDiagnostics=ast.some(node=>node.type==='assign'&&node.expression?.name==='scene_map');
  const diagnostic=value=>foldDiagnostics?value.toUpperCase():value;
  const used=new Set(' 0123456789-?.:+'+diagnostic('Division by zeroIndex out of range'));
  // File paths, button identifiers and palette colors are never drawn as text.
  const nonTextCalls=new Set(['scroll_image','audio_file','scene_map','masked_sheet','screen_image','actor_sheet','sprite_sheet','tile','tilemap','worldmap','background_clip','music_file',
    'button','button_pressed','button_released','input_button','sound_effect','music_track','bg_palette','sprite_palette']);
  const add=value=>{for(const char of value)used.add(char);};
  add(diagnostic(path.basename(filename)));
  function visit(node){
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!node||typeof node!=='object')return;
    if(node.filename)add(diagnostic(path.basename(node.filename)));
    if(node.type==='string')add(node.value);
    if(node.type==='call'&&node.name==='pool')add(diagnostic('Invalid pool handle'));
    if(node.type==='call'&&dialogueNames.has(node.name))add('|>');
    if(node.type==='call'&&nonTextCalls.has(node.name))return;
    for(const value of Object.values(node))if(value&&typeof value==='object')visit(value);
  }
  visit(ast);
  const chars=[...font.ids.keys()].filter(char=>used.has(char));
  return {foldDiagnostics,ids:new Map(chars.map((char,index)=>[char,index])),bytes:chars.flatMap(char=>{
    const start=font.ids.get(char)*16;return font.bytes.slice(start,start+16);
  })};
}
module.exports={compactFont};
