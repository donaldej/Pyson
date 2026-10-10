'use strict';

const { loadModules } = require('./modules');
const { generate } = require('./codegen');
const { collectAssets } = require('./assets');
const { planBanks } = require('./banking');
const { configureSave } = require('./save-codegen');
const { prepare } = require('./language-extensions');
const { collectTables } = require('./constant-tables');
const { formatError } = require('./diagnostics');

const defaults = {
  title: 'PYSON', target: 'dmg', controller: 'rom_only', ram_kb: 0,
  battery: false, rtc: false, rumble: false, sgb: false, version: 0,
  licensee: '00', manufacturer: '', destination: 'international', rom_kb: 0,
  cpu_speed: 'normal'
};

function validateHeader(h) {
  for (const key of Object.keys(defaults)) {
    if (typeof h[key] !== typeof defaults[key]) throw new Error(`header.${key} must be a ${typeof defaults[key]}`);
  }
  if (!['dmg', 'dual', 'cgb'].includes(h.target)) throw new Error('header.target must be "dmg", "dual", or "cgb"');
  if (!['normal', 'double'].includes(h.cpu_speed)) throw new Error('header.cpu_speed must be "normal" or "double"');
  if (h.cpu_speed === 'double' && h.target === 'dmg') throw new Error('Double CPU speed requires header.target = "dual" or "cgb"; dual games keep normal speed on monochrome hardware');
  if (!['rom_only', 'mbc1', 'mbc3', 'mbc5'].includes(h.controller)) throw new Error('Unsupported cartridge controller');
  if (!['japan', 'international'].includes(h.destination)) throw new Error('header.destination must be "japan" or "international"');
  if (!Number.isInteger(h.version) || h.version < 0 || h.version > 255) throw new Error('header.version must be 0..255');
  if (!/^[A-Z0-9]{2}$/.test(h.licensee)) throw new Error('header.licensee must contain two uppercase ASCII letters or digits');
  if (h.manufacturer && !/^[A-Z0-9]{4}$/.test(h.manufacturer)) throw new Error('header.manufacturer must contain four uppercase ASCII letters or digits');
  if (h.manufacturer && h.target === 'dmg') throw new Error('Manufacturer code requires a dual or cgb target');
  const titleLimit = h.manufacturer ? 11 : h.target === 'dmg' ? 16 : 15;
  if (!/^[\x20-\x7E]+$/.test(h.title) || h.title.length > titleLimit) throw new Error(`header.title must be 1..${titleLimit} printable ASCII characters`);
  if (![0, 8, 32, 64, 128].includes(h.ram_kb)) throw new Error('header.ram_kb must be 0, 8, 32, 64, or 128');
  if (![0, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192].includes(h.rom_kb)) throw new Error('header.rom_kb must be 0 (automatic) or a supported power-of-two capacity in KB');
  if (h.controller === 'rom_only' && (h.ram_kb || h.battery || h.rtc || h.rumble || h.rom_kb > 32)) throw new Error('rom_only supports up to 32 KB ROM and no external RAM or extra hardware');
  if (h.controller !== 'mbc5' && (h.ram_kb > 32 || h.rom_kb > 2048)) throw new Error('MBC1/MBC3 support at most 32 KB RAM and 2048 KB ROM');
  if (h.controller === 'mbc1' && h.rom_kb >= 1024 && h.ram_kb > 8) throw new Error('MBC1 ROMs of 1024 KB or more support at most 8 KB external RAM');
  if (h.rtc && (h.controller !== 'mbc3' || !h.battery)) throw new Error('RTC requires MBC3 and battery=True');
  if (h.rumble && h.controller !== 'mbc5') throw new Error('Rumble requires MBC5');
  if (h.rumble && h.ram_kb > 64) throw new Error('MBC5 rumble supports at most 64 KB RAM');
  if (h.battery && !h.ram_kb && !h.rtc) throw new Error('Battery requires external RAM or RTC');
  if (h.sgb && h.target === 'cgb') throw new Error('SGB support is incompatible with a Color-only target');
  let cartridge = 0;
  if (h.controller === 'mbc1') cartridge = h.ram_kb ? (h.battery ? 3 : 2) : 1;
  if (h.controller === 'mbc3') cartridge = h.rtc ? (h.ram_kb ? 0x10 : 0x0f) : h.ram_kb ? (h.battery ? 0x13 : 0x12) : 0x11;
  if (h.controller === 'mbc5') cartridge = (h.rumble ? 0x1c : 0x19) + (h.ram_kb ? (h.battery ? 2 : 1) : 0);
  const title = Buffer.alloc(16);
  title.write(h.title, 'ascii');
  if (h.manufacturer) title.write(h.manufacturer, 11, 'ascii');
  if (h.target !== 'dmg') title[15] = h.target === 'cgb' ? 0xc0 : 0x80;
  return [...title, ...Buffer.from(h.licensee, 'ascii'), h.sgb ? 3 : 0, cartridge, 0,
    { 0: 0, 8: 2, 32: 3, 128: 4, 64: 5 }[h.ram_kb], h.destination === 'japan' ? 0 : 1,
    0x33, h.version, 0, 0, 0];
}

function compile(source, filename = '<source>') {
  const sources = new Map([[filename, source]]);
  try {
    const loaded = loadModules(source, filename, sources);
    const { ast, constants } = prepare(loaded.ast);
    const modules = loaded.modules;
    const header = { ...defaults };
    const seen = new Set();
    let executable = false;
    for (const statement of ast) {
      const fail = message => { throw new Error(`Line ${statement.line}: ${message}`); };
      if (statement.type === 'header') {
        if (executable) fail('Header configuration must appear before executable statements');
        if (!Object.hasOwn(defaults, statement.key)) fail(`Unknown header field "${statement.key}"`);
        if (seen.has(statement.key)) fail(`Duplicate header field "${statement.key}"`);
        seen.add(statement.key);
        const value = statement.expression;
        if (!['number', 'string', 'boolean'].includes(value.type)) fail('Header settings require literal values');
        header[statement.key] = value.value;
      } else if (statement.type !== 'function') executable = true;
    }
    const save = configureSave(ast, header, seen);
    if (!seen.has('controller') && header.rom_kb > 32 && !save.enabled) header.controller = 'mbc5';
    validateHeader(header);
    const graphics = collectAssets(ast, filename);
    graphics.tables = collectTables(ast);
    planBanks(graphics, header, seen.has('controller'));
    const headerBytes = validateHeader(header);
    const generated = generate(ast, header, headerBytes, graphics, save, functions => {
      planBanks(graphics, header, seen.has('controller'), functions);
      return validateHeader(header);
    });
    return { ast, modules, constants, header, banking: graphics.banking, save, ...generated, assets: graphics.assets.map(({ tiles, maps, ...asset }) => ({ ...asset, tileCount: tiles.length, maps })) };
  } catch (error) {
    throw formatError(error, filename, sources);
  }
}

module.exports = { compile, validateHeader, defaults };
