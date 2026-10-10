'use strict';
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
    banks: compiled.banking, assets: compiled.assets.map(({ initialCells, maps, definitions, cellMap, ...asset }) => asset) };
}
module.exports = { makeReport };
