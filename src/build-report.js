'use strict';
const path = require('node:path');
const font = require('./font');

function makeGraphicsReport(assets, residentHint, maskedTint=false, maskedTintCache=false, maskedFill=false) {
  const masked = assets.some(asset=>asset.kind==='masked');
  const worlds = assets.filter(asset => asset.kind === 'world');
  // Non-streamed map IDs already include global deduplication and font tiles.
  let residentTiles = assets.some(asset=>asset.actor) ? Math.min(...assets.filter(asset=>asset.actor).map(asset=>asset.actor.tileBase)) : font.bytes.length / 16;
  if (worlds.length) residentTiles = worlds[0].streaming.tileBase;
  else for (const asset of assets) {
    if (['collision', 'clip', 'actor', 'screen', 'scene'].includes(asset.kind)) continue;
    for (const map of asset.maps || []) for (const id of map) residentTiles = Math.max(residentTiles, id + 1);
  }
  if(residentHint!==undefined)residentTiles=residentHint;
  const clipSlots = assets.some(asset => asset.clip)
    ? 2 * Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer)) : 0;
  const sharedClipSlots = Math.max(0,...assets.map(asset=>asset.clip?.sharedSlots||0));
  if(sharedClipSlots)residentTiles=Math.max(residentTiles,...assets.filter(asset=>asset.clip).map(asset=>asset.clip.sharedBase+asset.clip.sharedSlots));
  return {
    tileBytes: 16, tileCapacity: masked ? 128 : 256, residentTiles, residentTileBytes: residentTiles * 16, sharedClipSlots,
    streamingTileCapacity: masked ? 0 : 256 - residentTiles - clipSlots - assets.reduce((sum,asset)=>sum+(asset.actor?.reservedTiles||0),0),
    actorTileSlots: assets.reduce((sum,asset)=>sum+(asset.actor?.reservedTiles||0),0),
    actorSpriteSlots: assets.reduce((sum,asset)=>sum+(asset.actor?.reservedSprites||0),0),
    ...(assets.some(asset => asset.clip) ? { backgroundClips: {
      patternsPerBuffer: Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer)),
      reservedSlots: 2 * Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer))
    } } : {}),
    ...(masked ? {maskedComposition:{layers:4,patternsPerBuffer:128,physicalPatternSlots:384,cartridgeScratchBytes:maskedTintCache?32768:maskedTint?8192:4096,...(maskedTint?{colorOverlays:{cgbOnly:true,cgbWorkRamBytes:maskedFill?8192:4096,cached:maskedTintCache,cacheEntriesPerLayer:maskedTintCache?3:0,spriteComponents:40,componentsPerBand:10,sharedBaseShade:0,...(maskedFill?{opaqueTileFill:true,reservedBackgroundPalettes:[4,5,6,7],stationaryAttributeBytes:576,attributeInterruptStack:true,privatePaletteSave:assets.some(a=>a.paletteCount>1)}:{}),overflow:'retain untinted body pixels'}}:{})}} : {}),
    exclusiveScreenImages: assets.filter(asset=>asset.kind==='screen').length,
    exclusiveScrollingImages: assets.filter(asset=>asset.kind==='scroll').length,
    ...(assets.some(asset=>asset.kind==='scene') ? {sceneMaps:{count:assets.filter(asset=>asset.kind==='scene').length,peakPatterns:Math.max(...assets.filter(asset=>asset.kind==='scene').map(asset=>asset.scenePatterns)),tileBase:assets.find(asset=>asset.kind==='scene').sceneTileBase}} : {}),
    spriteComponentCapacity: 40, spriteComponentsPerScanline: 10,
    importedBackgroundPalettes: new Set(assets.filter(asset => asset.file && !['sprite','actor','collision','screen','masked'].includes(asset.kind)).map(asset => asset.paletteIndex)).size,
    importedSpritePalettes: new Set(assets.filter(asset => ['sprite','actor'].includes(asset.kind)).map(asset => asset.paletteIndex)).size,
    assets: assets.filter(asset => asset.kind !== 'collision').map(asset => {
      const uniqueTiles = asset.streaming?.uniqueTiles ?? (asset.kind === 'manual'
        ? new Set((asset.maps || []).flat()).size : asset.tileCount);
      return {
        id: asset.id, name: asset.file ? path.relative(path.resolve(__dirname, '..'), asset.file).replace(/\\/g, '/') : asset.label,
        kind: asset.kind, mapPositions: asset.columns * asset.rows * asset.frames,
        uniqueTiles, tilePatternBytes: uniqueTiles * 16,
        spriteComponentsPerFrame: asset.kind === 'actor' ? asset.actor.reservedSprites : asset.kind === 'sprite' ? asset.columns * asset.rows : 0,
        ...(asset.kind==='masked' ? {frames:asset.frames,romDataBytes:asset.romBytes} : {}),
        ...(asset.kind==='scene' ? {scenePatterns:asset.scenePatterns,sceneTileBase:asset.sceneTileBase} : {}),
        ...(asset.actor ? {actor:asset.actor} : {}),
        paletteIndex: asset.file ? asset.paletteIndex : undefined, quantized: Boolean(asset.quantized), sourceColors: asset.sourceColors,
        ...(asset.clip ? { clip: asset.clip } : {}),
        ...(asset.streaming ? { streaming: {
          allocatedSlots: asset.streaming.slotCount, localPeakTiles: asset.streaming.peakTiles,
          availableSlots: asset.streaming.capacity, allocatedTileBytes: asset.streaming.slotCount * 16
        } } : {})
      };
    })
  };
}

function formatReport(report) {
  const lines = ['Pyson build report', '', `ROM: ${report.romBytes} bytes (${report.romBytes / 1024} KiB)`,
    `Working RAM: ${report.wramUsedBytes}/${report.wramCapacityBytes} bytes; ${report.wramFreeBytes} bytes free`,
    '', 'Graphics', `Resident tile slots (font and shared assets): ${report.graphics.residentTiles}/${report.graphics.tileCapacity}`,
    `Imported palettes: ${report.graphics.importedBackgroundPalettes}/7 background, ${report.graphics.importedSpritePalettes}/8 sprite (${report.graphics.exclusiveScreenImages ? 'exclusive screen images temporarily use background slot 0' : 'background slot 0 remains available for text'})`,
    `Hardware sprites: ${report.graphics.spriteComponentCapacity} components total, ${report.graphics.spriteComponentsPerScanline} per horizontal scanline`,
    'Sprite costs below are per frame drawn, not per sheet or per game.',
    'Asset tile counts describe each asset; shared patterns mean they must not be added together.', ''];
  if (report.wramXVariableBytes) lines.push(`Fixed work-RAM bank 1: ${report.wramXVariableBytes}/1024 bytes of variables; ${report.stackBytes} bytes reserved for the CPU stack.`, '');
  if (report.graphics.backgroundClips) lines.push(
    `Background clip buffers: ${report.graphics.backgroundClips.reservedSlots} additional slots; ${report.graphics.residentTiles + report.graphics.backgroundClips.reservedSlots + (report.graphics.actorTileSlots || 0)}/256 slots reserved in total.`, '');
  if (report.graphics.exclusiveScreenImages) lines.push(`Exclusive screen images: ${report.graphics.exclusiveScreenImages}; each temporarily replaces the ordinary graphics and can use up to 256 patterns.`, '');
  if (report.graphics.sharedClipSlots) lines.push(`Persistent clip patterns: ${report.graphics.sharedClipSlots} slots already included in resident tiles; these are not uploaded per frame.`, '');
  if (report.graphics.actorTileSlots) lines.push(`Actor buffers: ${report.graphics.actorTileSlots} additional tile slots; ${report.graphics.actorSpriteSlots}/40 sprite components reserved.`, '');
    if(report.graphics.maskedComposition)lines.push(`Masked composition: four layers with four opaque shades plus transparency; 128 dynamic cells per hidden buffer, ${report.graphics.maskedComposition.cartridgeScratchBytes} bytes of volatile cartridge RAM.`, '');
    if(report.graphics.maskedComposition?.colorOverlays?.opaqueTileFill)lines.push('Filled masked tiles also reserve work-RAM bank 3 for stationary attributes, saved indexed palettes and an interrupt-safe private stack.', '');
    if(report.graphics.maskedComposition?.colorOverlays)lines.push('CGB color overlays: owns 40 hardware sprite components, at most 10 per aligned 16-pixel band. Reserves work-RAM bank 2 (4096 bytes) for private graphics staging/stack. Crowded areas retain the untinted base image; DMG uses the base image only.', '');
  for (const asset of report.graphics.assets) {
    if(asset.kind==='masked'){
        lines.push(`${asset.name} (masked)`,`  ${asset.frames} animation frames; masks, mirrored/aligned variants and indices: ${asset.romDataBytes} ROM bytes.`, report.graphics.maskedComposition?.colorOverlays ? '  Base image uses no sprites; optional CGB accents share the 40-component color budget.' : '  Hardware sprite components: 0. Colors inherit the scenery tile palette.', '');
      continue;
    }
    lines.push(`${asset.name} (${asset.kind})`,
      `  ${asset.mapPositions} tile positions -> ${asset.uniqueTiles} unique tile patterns`,
      `  Tile pattern data: ${asset.tilePatternBytes} bytes (16 bytes per pattern)`,
      `  Sprite components per frame drawn: ${asset.spriteComponentsPerFrame}`);
    lines.push(asset.paletteIndex === undefined
      ? '  Palettes: inherited from the source tiles'
      : `  Palette slot: ${asset.paletteIndex} (${['sprite','actor'].includes(asset.kind) ? 'sprite' : 'background'})`);
    if (asset.streaming) lines.push(
      `  Streaming VRAM slots: ${asset.streaming.allocatedSlots}/${asset.streaming.availableSlots} available (${asset.streaming.allocatedTileBytes} bytes)`,
      `  Largest local tile set: ${asset.streaming.localPeakTiles}; full world dictionary: ${asset.uniqueTiles}`);
    if (asset.kind === 'screen') lines.push('  Exclusive screen: patterns temporarily replace ordinary graphics; clear_screen() restores them.');
    if (asset.kind === 'scene') lines.push(`  Scene pool: ${asset.scenePatterns} patterns loaded at tile ${asset.sceneTileBase}; other arenas reuse these slots.`);
    if (asset.clip) lines.push(`  Background clip: ${asset.clip.peakFramePatterns} patterns in its largest frame; two shared buffers reserve ${asset.clip.patternsPerBuffer * 2} VRAM slots in addition to resident tiles.`);
    if (asset.quantized) lines.push(`  Colors reduced during import from ${asset.sourceColors} source colors to the hardware palette limit.`);
    lines.push('');
  }
  if (!report.graphics.assets.length) lines.push('No imported graphical assets.', '');
  lines.push('Map layouts, palettes, and other ROM data are separate from tile pattern bytes.',
    'These are static asset budgets, not a measurement of simultaneous sprites or frame speed.', '');
  return lines.join('\n');
}
function makeReport(compiled, symbolText, romBytes) {
  const addresses = new Map(symbolText.split(/\r?\n/).filter(line => line && !line.startsWith(';')).map(line => {
    const [address, name] = line.trim().split(/\s+/); const [bank, offset] = address.split(':');
    return [name, { bank: parseInt(bank, 16), address: parseInt(offset, 16) }];
  }));
  const variables = compiled.symbols.map(symbol => ({ ...symbol, bytes: symbol.bytes ?? 2, ...addresses.get(symbol.label) }));
  const namedVariableBytes = variables.reduce((sum, variable) => sum + variable.bytes, 0);
  const mutableMapBytes = compiled.assets.filter(asset => asset.mutable).reduce((sum, asset) => sum + asset.initialCells.length, 0);
  const wram0UsedBytes = addresses.get('wStateEnd').address - 0xc000;
  const wramXVariableBytes = addresses.has('wSpillEnd') ? addresses.get('wSpillEnd').address - addresses.get('wSpillStart').address : 0;
  const capacity = wramXVariableBytes ? 5120 : 4096, used = wram0UsedBytes + wramXVariableBytes;
  return { romBytes, wramCapacityBytes: capacity, wramUsedBytes: used, wramFreeBytes: capacity - used,
    wram0UsedBytes, wramXVariableBytes, stackBytes: wramXVariableBytes ? 3072 : 4096, namedVariableBytes, mutableMapBytes,
    runtimeAndBufferBytes: used - namedVariableBytes - mutableMapBytes, constants: compiled.constants, variables,
    sources: compiled.sourceLocations.map(site => ({ ...site, ...addresses.get(site.label) })),
    banks: compiled.banking, graphics: makeGraphicsReport(compiled.assets, (addresses.get('FontEnd').address-addresses.get('Font').address)/16, addresses.has('wTintEnabled'),addresses.has('wTintCacheValid'),addresses.has('wMaskedFill')),
    assets: compiled.assets.map(({ initialCells, maps, definitions, cellMap, ...asset }) => asset) };
}
module.exports = { makeReport, makeGraphicsReport, formatReport };
