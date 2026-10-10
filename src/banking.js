'use strict';

// Keep each object contiguous: readers never cross the switchable window.
function planBanks(graphics, header, explicitController = false, functions = []) {
  const limit = 16383; // Leave the final byte available for capacity padding.
  const objects = [{ label: 'Font', bytes: graphics.tileData.length }];
  for (const asset of graphics.assets) {
    if (asset.kind === 'world') continue;
    asset.romBytes = asset.mutable ? asset.initialCells.length : asset.kind === 'manual' ? 2 + asset.cellMap.length + asset.definitions.length * 3 : asset.maps.flat().length;
    objects.push({ label: asset.label, bytes: asset.romBytes, asset });
  }
  objects.push(...(graphics.worldObjects || []).map(object => ({ label: object.label, kind: object.kind, bytes: object.bytes, worldObject: object, asset: object.asset })));
  objects.push(...(graphics.tables || []).map(table => ({ label: table.label, kind: table.kind, bytes: table.bytes, table })));
  objects.push(...functions);
  function pack(controller) {
    const banks = new Map();
    const max = controller === 'rom_only' ? 1 : controller === 'mbc5' ? 511 : 127;
    for (const object of objects) {
      if (object.bytes > limit) throw new Error(`${object.label}: static asset exceeds one 16 KB ROM bank; split the asset`);
      let bank;
      for (let candidate = 1; candidate <= max; candidate++) {
        if (controller === 'mbc1' && candidate % 32 === 0) continue;
        if ((banks.get(candidate) || 0) + object.bytes <= limit) { bank = candidate; break; }
      }
      if (!bank) return null;
      object.bank = bank;
      object.address = 0x4000 + (banks.get(bank) || 0);
      banks.set(bank, (banks.get(bank) || 0) + object.bytes);
    }
    return banks;
  }
  let banks = pack(header.controller);
  if (!banks && !explicitController && header.controller === 'rom_only') {
    header.controller = 'mbc5';
    banks = pack(header.controller);
  }
  if (!banks) throw new Error(`Static assets and functions exceed ${header.controller} bank capacity; choose a larger controller or reduce the program`);
  const highestBank = Math.max(...banks.keys());
  const requiredKB = 16 * 2 ** Math.ceil(Math.log2(highestBank + 1));
  if (header.rom_kb && header.rom_kb < requiredKB) throw new Error(`header.rom_kb=${header.rom_kb} is too small: banked assets and functions require ${requiredKB} KB`);
  if (header.controller === 'mbc1' && Math.max(requiredKB, header.rom_kb) >= 1024 && header.ram_kb > 8) throw new Error('MBC1 ROMs of 1024 KB or more support at most 8 KB external RAM');
  for (const object of objects) if (object.asset) Object.assign(object.asset, { bank: object.bank, address: object.address });
  for (const object of objects) if (object.worldObject) Object.assign(object.worldObject, { bank: object.bank, address: object.address });
  for (const object of objects) if (object.table) Object.assign(object.table, { bank: object.bank, address: object.address });
  graphics.banking = { controller: header.controller, requiredKB, romKB: header.rom_kb || requiredKB, highestBank, objects: objects.map(({ asset, code, worldObject, table, ...object }) => object) };
  return graphics.banking;
}

module.exports = { planBanks };
