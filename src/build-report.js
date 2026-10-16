'use strict';
const path = require('node:path');
const font = require('./font');

function makeGraphicsReport(assets) {
  const worlds = assets.filter(asset => asset.kind === 'world');
  // Non-streamed map IDs already include global deduplication and font tiles.
  let residentTiles = font.bytes.length / 16;
  if (worlds.length) residentTiles = worlds[0].streaming.tileBase;
  else for (const asset of assets) {
    if (['collision', 'clip'].includes(asset.kind)) continue;
    for (const map of asset.maps || []) for (const id of map) residentTiles = Math.max(residentTiles, id + 1);
  }
  const clipSlots = assets.some(asset => asset.clip)
    ? 2 * Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer)) : 0;
  return {
    tileBytes: 16, tileCapacity: 256, residentTiles, residentTileBytes: residentTiles * 16,
    streamingTileCapacity: 256 - residentTiles - clipSlots,
    ...(assets.some(asset => asset.clip) ? { backgroundClips: {
      patternsPerBuffer: Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer)),
      reservedSlots: 2 * Math.max(...assets.filter(asset => asset.clip).map(asset => asset.clip.patternsPerBuffer))
    } } : {}),
    spriteComponentCapacity: 40, spriteComponentsPerScanline: 10,
    importedBackgroundPalettes: new Set(assets.filter(asset => asset.file && asset.kind !== 'sprite' && asset.kind !== 'collision').map(asset => asset.paletteIndex)).size,
    importedSpritePalettes: new Set(assets.filter(asset => asset.kind === 'sprite').map(asset => asset.paletteIndex)).size,
    assets: assets.filter(asset => asset.kind !== 'collision').map(asset => {
      const uniqueTiles = asset.streaming?.uniqueTiles ?? (asset.kind === 'manual'
        ? new Set((asset.maps || []).flat()).size : asset.tileCount);
      return {
        id: asset.id, name: asset.file ? path.relative(path.resolve(__dirname, '..'), asset.file).replace(/\\/g, '/') : asset.label,
        kind: asset.kind, mapPositions: asset.columns * asset.rows * asset.frames,
        uniqueTiles, tilePatternBytes: uniqueTiles * 16,
        spriteComponentsPerFrame: asset.kind === 'sprite' ? asset.columns * asset.rows : 0,
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
    `Imported palettes: ${report.graphics.importedBackgroundPalettes}/7 background, ${report.graphics.importedSpritePalettes}/8 sprite (background slot 0 remains available for text)`,
    `Hardware sprites: ${report.graphics.spriteComponentCapacity} components total, ${report.graphics.spriteComponentsPerScanline} per horizontal scanline`,
    'Sprite costs below are per frame drawn, not per sheet or per game.',
    'Asset tile counts describe each asset; shared patterns mean they must not be added together.', ''];
  if (report.graphics.backgroundClips) lines.push(
    `Background clip buffers: ${report.graphics.backgroundClips.reservedSlots} additional slots; ${report.graphics.residentTiles + report.graphics.backgroundClips.reservedSlots}/256 slots reserved in total.`, '');
  for (const asset of report.graphics.assets) {
    lines.push(`${asset.name} (${asset.kind})`,
      `  ${asset.mapPositions} tile positions -> ${asset.uniqueTiles} unique tile patterns`,
      `  Tile pattern data: ${asset.tilePatternBytes} bytes (16 bytes per pattern)`,
      `  Sprite components per frame drawn: ${asset.spriteComponentsPerFrame}`);
    lines.push(asset.paletteIndex === undefined
      ? '  Palettes: inherited from the source tiles'
      : `  Palette slot: ${asset.paletteIndex} (${asset.kind === 'sprite' ? 'sprite' : 'background'})`);
    if (asset.streaming) lines.push(
      `  Streaming VRAM slots: ${asset.streaming.allocatedSlots}/${asset.streaming.availableSlots} available (${asset.streaming.allocatedTileBytes} bytes)`,
      `  Largest local tile set: ${asset.streaming.localPeakTiles}; full world dictionary: ${asset.uniqueTiles}`);
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
  const used = addresses.get('wStateEnd').address - 0xc000;
  return { romBytes, wramCapacityBytes: 4096, wramUsedBytes: used, wramFreeBytes: 4096 - used, namedVariableBytes, mutableMapBytes,
    runtimeAndBufferBytes: used - namedVariableBytes - mutableMapBytes, constants: compiled.constants, variables,
    sources: compiled.sourceLocations.map(site => ({ ...site, ...addresses.get(site.label) })),
    banks: compiled.banking, graphics: makeGraphicsReport(compiled.assets),
    assets: compiled.assets.map(({ initialCells, maps, definitions, cellMap, ...asset }) => asset) };
}
module.exports = { makeReport, makeGraphicsReport, formatReport };
