'use strict';

function prepareWorlds(assets, tileBase) {
  const objects = [];
  const cache = new Map();
  let serial = 0;
  const db = bytes => Array.from({ length: Math.ceil(bytes.length / 16) }, (_, i) => `    db ${bytes.slice(i * 16, i * 16 + 16).join(', ')}`).join('\n');
  function object(label, kind, bytes, body, asset) {
    const result = { label, kind, bytes, body, asset };
    objects.push(result); return result;
  }
  function blob(kind, data) {
    const signature = kind + ':' + data.join(',');
    if (!cache.has(signature)) {
      const label = `WorldData${serial++}`;
      if (kind === 'world_layout') {
        // Keep row pointers and their dictionary in one bank. Repeated rows
        // share storage without adding any decompression buffer to WRAM.
        const rows = [], unique = [], indices = new Map();
        for (let start = 0; start < data.length; start += 32) {
          const row = data.slice(start, start + 32), key = row.join(',');
          if (!indices.has(key)) { indices.set(key, unique.length); unique.push(row); }
          rows.push(indices.get(key));
        }
        cache.set(signature, object(label, kind, rows.length * 2 + unique.length * 32,
          `${label}:\n${rows.map(index => `    dw ${label}Row${index}`).join('\n')}\n${unique.map((row, index) => `${label}Row${index}:\n${db(row)}`).join('\n')}`));
      } else {
        cache.set(signature, object(label, kind, data.length, `${label}:\n${db(data)}`));
      }
    }
    return cache.get(signature);
  }
  for (const world of assets.filter(asset => asset.kind === 'world')) {
    const capacity = 256 - tileBase;
    const bitmaps = [], bitmapIDs = new Map();
    function tileID(tile) {
      const key = tile.join(',');
      if (!bitmapIDs.has(key)) { bitmapIDs.set(key, bitmaps.length); bitmaps.push(tile); }
      return bitmapIDs.get(key);
    }
    let cells;
    if (world.cells) {
      cells = world.cells.map(tile => ({ id: tileID(tile.tiles[0]), flags: tile.paletteIndex | (tile.solid ? 128 : 0), terrain: tile.terrain }));
    } else {
      const ids = world.tiles.map(tileID);
      cells = world.maps[0].map((id, index) => ({ id: ids[id], flags: world.paletteIndex | (world.collision?.[index] ? 128 : 0), terrain: 0 }));
    }
    world.tiles = bitmaps;
    world.maps = [cells.map(cell => cell.id)];
    delete world.cells; delete world.collision;
    const chunkColumns = Math.ceil(world.columns / 32);
    const chunkRows = Math.ceil(world.rows / 32);
    const chunks = [];
    for (let cy = 0; cy < chunkRows; cy++) for (let cx = 0; cx < chunkColumns; cx++) {
      const definitions = [], indices = new Map(), map = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const wx = cx * 32 + x, wy = cy * 32 + y;
        const cell = wx < world.columns && wy < world.rows ? cells[wy * world.columns + wx] : { id: 0, flags: 128, terrain: 0 };
        const key = `${cell.id},${cell.flags},${cell.terrain}`;
        if (!indices.has(key)) { indices.set(key, definitions.length); definitions.push([cell.id & 255, cell.id >> 8, cell.flags, cell.terrain]); }
        map.push(indices.get(key));
      }
      if (definitions.length > 256) throw new Error(`${world.file || world.label}: a 32x32 world chunk exceeds 256 distinct tile/property definitions; simplify that chunk`);
      const label = `${world.label}Chunk${chunks.length}`;
      chunks.push(object(label, 'world_chunk', 2 + 1024 + definitions.length * 4,
        `${label}:\n    dw ${label}Definitions\n${db(map)}\n${label}Definitions:\n${db(definitions.flat())}`));
    }
    const regionColumns = Math.floor(Math.max(0, world.columns * 8 - 160) / 32) + 1;
    const regionRows = Math.floor(Math.max(0, world.rows * 8 - 144) / 32) + 1;
    const regions = [], windows = [];
    let peakTiles = 0;
    for (let ry = 0; ry < regionRows; ry++) for (let rx = 0; rx < regionColumns; rx++) {
      const regionCells = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const wx = rx * 4 - 1 + x, wy = ry * 4 - 1 + y;
        regionCells.push(x < 26 && y < 24 && wx >= 0 && wy >= 0 && wx < world.columns && wy < world.rows ? cells[wy * world.columns + wx] : null);
      }
      const ids = [...new Set(regionCells.filter(Boolean).map(cell => cell.id))].sort((a, b) => a - b);
      peakTiles = Math.max(peakTiles, ids.length);
      if (ids.length > capacity) throw new Error(`${world.file || world.label}: streaming region (${rx * 4}, ${ry * 4}) needs ${ids.length} tiles, but only ${capacity} slots remain after resident fonts/sprites/assets; reduce local tile variety`);
      windows.push({ cells: regionCells, ids, rx, ry });
    }
    // Neighboring windows must coexist while the old viewport remains displayed.
    // Color their interference graph so shared graphics keep the same VRAM slot.
    const neighbors = Array.from({ length: bitmaps.length }, () => new Set());
    for (const window of windows) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = window.rx + dx, ny = window.ry + dy;
      if (nx < 0 || ny < 0 || nx >= regionColumns || ny >= regionRows) continue;
      const other = windows[ny * regionColumns + nx];
      for (const id of window.ids) for (const peer of other.ids) if (id !== peer) neighbors[id].add(peer);
    }
    const colors = Array(bitmaps.length).fill(-1);
    const order = colors.map((_, id) => id).sort((a, b) => neighbors[b].size - neighbors[a].size || a - b);
    let slotCount = 0;
    for (const id of order) {
      const used = new Set([...neighbors[id]].map(peer => colors[peer]));
      let color = 0;
      while (used.has(color)) color++;
      if (color >= capacity) throw new Error(`${world.file || world.label}: neighboring streaming regions cannot share ${capacity} VRAM slots safely; reduce tile variety near region boundaries or resident assets`);
      colors[id] = color; slotCount = Math.max(slotCount, color + 1);
    }
    const slots = new Map(colors.map((color, id) => [id, tileBase + color]));
    const tileGraphics = bitmaps.map(tile => blob('world_tile', tile));
    for (const { cells: regionCells, ids } of windows) {
      const palettes = [...new Set(regionCells.filter(Boolean).map(cell => cell.flags & 7))];
      const uniformPalette = palettes.length === 1 ? palettes[0] : 255;
      const map = regionCells.map(cell => cell ? slots.get(cell.id) : 0);
      if (uniformPalette === 255) map.push(...regionCells.map(cell => cell ? cell.flags & 7 : 0));
      const graphicsKey = 'world_graphics:' + ids.map(id => `${slots.get(id)}:${id}:${tileGraphics[id].label}`).join(',');
      if (!cache.has(graphicsKey)) {
        const label = `WorldData${serial++}`;
        cache.set(graphicsKey, object(label, 'world_graphics', ids.length * 7,
          `${label}:\n${ids.map(id => `    db ${slots.get(id)}\n    dw ${id}, ${tileGraphics[id].label}, BANK(${tileGraphics[id].label})`).join('\n')}`));
      }
      const graphics = cache.get(graphicsKey);
      const layout = blob('world_layout', map);
      const label = `${world.label}Region${regions.length}`;
      regions.push(object(label, 'world_region', 10,
        `${label}:\n    db ${ids.length}, ${uniformPalette}\n    dw ${graphics.label}, BANK(${graphics.label})\n    dw ${layout.label}, BANK(${layout.label})`));
    }
    const label = world.label;
    const header = object(label, 'world_header', 10 + (chunks.length + regions.length) * 4,
      `${label}:\n    db ${world.columns}, ${world.rows}, ${chunkColumns}, ${regionColumns}, ${regionRows}, 0\n    dw ${label}Chunks, ${label}Regions\n${label}Chunks:\n${chunks.map(chunk => `    dw ${chunk.label}, BANK(${chunk.label})`).join('\n')}\n${label}Regions:\n${regions.map(region => `    dw ${region.label}, BANK(${region.label})`).join('\n')}`, world);
    world.romBytes = header.bytes;
    world.streaming = { chunkColumns, chunkRows, regionColumns, regionRows, tileBase, capacity, peakTiles, uniqueTiles: bitmaps.length, slots: colors.map(color => tileBase + color), slotCount, regionStep: 32 };
  }
  return objects;
}
module.exports = { prepareWorlds };
