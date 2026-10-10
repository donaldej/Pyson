'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const root = path.resolve(__dirname, '..');
const { emulatorPython } = require('../scripts/environment');
const python = emulatorPython();

test('battery saves survive full emulator restarts, bank switching, corruption, deletion and clearing',
  { skip: !fs.existsSync(python) && 'Install the PyBoy test environment' }, () => {
    const dir = path.join(root, 'build', 'tests', 'saves');
    fs.mkdirSync(dir, { recursive: true });
    const cases = [];
    const outputs = [];
    const options = [
      ['mbc1', 32, ''], ['mbc3', 32, ''], ['mbc3', 32, 'header.rtc = True\n'],
      ['mbc5', 32, ''], ['mbc5', 128, ''], ['mbc5', 64, 'header.rumble = True\n'],
      ['mbc1', 8, 'header.rom_kb = 1024\n']
    ];
    for (const [controller, ramKB, extra] of options) for (const cgb of [false, true]) {
      const count = ramKB * 128;
      const name = `runtime-saves-${controller}-${ramKB}-${extra.includes('rtc') ? 'rtc-' : ''}${cgb}`;
      // Slot 1024 must map to SRAM bank 1 rather than aliasing bank 0.
      const slots = ramKB === 8 ? [0, 127, 255, 511, count - 1] : [0, 1023, 1024, 2047, count - 1];
      const values = [0, -1, -32768, 32767, 1234];
      const source = `header.target = "dual"
header.controller = "${controller}"
header.ram_kb = ${ramKB}
${extra}import includes.rooms as rooms
hero = sprite_sheet("../scrolling-world/assets/player.bmp")
slots = [${slots}]
values = [${values}]
boot = [0, 0, 0, 0, 0]
for i in range(5):
    boot[i] = save_read(slots[i], -77)
initial_exists = save_exists(0)
nested_value = save_read(4, -99)
nested_slot_value = save_read(6, -99)
ok = 0
deleted = 0
phase = 0
draw_world(rooms.room17)
while True:
    wait_vblank()
    if button_pressed("a"):
        ok = 0
        for i in range(5):
            ok += save_write(slots[i], values[i])
        nested = save_write(4, save_read(2, 11) + save_read(3, -5))
        nested_slot = save_write(save_read(5, 6), save_read(7, -123))
        phase = 1
    if button_pressed("select"):
        deleted = save_delete(slots[4])
        phase = 2
    if button_pressed("start"):
        save_clear()
        phase = 3
    negative = -1
    beyond = save_capacity()
    bad_read = save_read(negative, 987)
    bad_read_high = save_read(beyond, -987)
    bad_write = save_write(negative, 3)
    bad_write_high = save_write(beyond, 3)
    bad_exists = save_exists(negative)
    bad_delete = save_delete(beyond)
    first = save_read(0, -55)
    last = save_read(slots[4], -55)
    last_exists = save_exists(slots[4])
    solid = tile_is_solid(rooms.room17, 24, 5)
    floor = tile_terrain(rooms.room0, 1, 1)
    sprite(0, hero, 0, 40, 40)
    refresh_screen()`;
      const result = compile(source, path.join(root, 'examples/banked-world/main.pysn'));
      const asm = path.join(dir, name + '.asm');
      fs.writeFileSync(asm, result.assembly);
      const rom = assemble(asm, name);
      const bytes = fs.readFileSync(rom);
      assert.equal(bytes[0x149], { 8: 2, 32: 3, 64: 5, 128: 4 }[ramKB]);
      assert.equal(bytes[0x147], controller === 'mbc1' ? 3 : controller === 'mbc3' ? (extra ? 0x10 : 0x13) : extra ? 0x1e : 0x1b);
      const initial = path.join(dir, name + '-blank.ram');
      const written = path.join(dir, name + '-written.ram');
      const deleted = path.join(dir, name + '-deleted.ram');
      const cleared = path.join(dir, name + '-cleared.ram');
      // Check both zero-filled and erased (all $FF) SRAM startup behavior.
      fs.writeFileSync(initial, Buffer.alloc(ramKB * 1024, cgb ? 255 : 0));
      const common = { rom, cgb, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
        registers: [{ address: 0xa000, value: 255 }] };
      const invariants = { bad_read: 987, bad_read_high: -987, bad_write: 0, bad_write_high: 0, bad_exists: 0, bad_delete: 0, solid: 1, floor: 2 };
      cases.push({ ...common, name: name + '-write', ram_in: initial, ram_out: written,
        arrays: { boot: [-77, -77, -77, -77, -77] }, variables: { ...invariants, initial_exists: 0, first: -55, last: -55 },
        steps: [{ press: ['a'], frames: 12, variables: { phase: 1, ok: 5, nested: 1, nested_slot: 1, first: 0, last: 1234, last_exists: 1 }, registers: common.registers }] });
      cases.push({ ...common, name: name + '-restart-delete', ram_in: written, ram_out: deleted,
        arrays: { boot: values }, variables: { ...invariants, initial_exists: 1, nested_value: 6, nested_slot_value: -123, first: 0, last: 1234 },
        steps: [{ press: ['select'], frames: 12, variables: { phase: 2, deleted: 1, last: -55, last_exists: 0 }, registers: common.registers }] });
      cases.push({ ...common, name: name + '-restart-clear', ram_in: deleted, ram_out: cleared,
        arrays: { boot: [...values.slice(0, 4), -77] }, variables: { ...invariants, initial_exists: 1, first: 0, last: -55 },
        steps: [{ press: ['start'], frames: ramKB === 128 ? 120 : 50, variables: { phase: 3, first: -55, last: -55, last_exists: 0 }, registers: common.registers }] });
      cases.push({ ...common, name: name + '-restart-cleared', ram_in: cleared,
        arrays: { boot: [-77, -77, -77, -77, -77] }, variables: { ...invariants, initial_exists: 0, nested_value: -99, nested_slot_value: -99, first: -55, last: -55 } });
      outputs.push({ written, slots, values, cleared, bytes: ramKB * 1024 });
      if (controller === 'mbc5' && ramKB === 32) {
        const corrupted = Buffer.alloc(ramKB * 1024, 255);
        const record = (slot, input) => {
          const value = input & 65535;
          Buffer.from([80, 89, 1, value & 255, value >> 8, (~value) & 255, (~value >> 8) & 255, 165]).copy(corrupted, slot * 8);
        };
        slots.forEach((slot, i) => record(slot, values[i]));
        record(4, 6); record(6, -123);
        corrupted[slots[0] * 8 + 3] ^= 1; // Payload corruption.
        corrupted[slots[1] * 8 + 2] = 2; // Unknown format version.
        corrupted[slots[2] * 8 + 7] = 0; // Interrupted, uncommitted write.
        corrupted[slots[3] * 8] ^= 1; // Damaged signature.
        corrupted[6 * 8 + 5] ^= 1; // Damaged value complement.
        const damaged = path.join(dir, name + '-corrupt.ram');
        const repaired = path.join(dir, name + '-repaired.ram');
        fs.writeFileSync(damaged, corrupted);
        cases.push({ ...common, name: name + '-corrupt', ram_in: damaged, ram_out: repaired,
          arrays: { boot: [-77, -77, -77, -77, 1234] },
          variables: { ...invariants, initial_exists: 0, first: -55, last: 1234, last_exists: 1, nested_value: 6, nested_slot_value: -99 },
          steps: [{ press: ['a'], frames: 12, variables: { ok: 5, nested: 1, nested_slot: 1, first: 0, last: 1234 }, registers: common.registers }] });
        cases.push({ ...common, name: name + '-restart-repaired', ram_in: repaired,
          arrays: { boot: values }, variables: { ...invariants, initial_exists: 1, nested_value: 6, nested_slot_value: -123 } });
      }
    }

    const demoFile = path.join(root, 'examples/save-counter/main.pysn');
    const demo = compile(fs.readFileSync(demoFile, 'utf8'), demoFile);
    const demoAsm = path.join(dir, 'save-counter.asm');
    fs.writeFileSync(demoAsm, demo.assembly);
    const demoROM = assemble(demoAsm, 'runtime-save-counter');
    for (const cgb of [false, true]) {
      const blank = path.join(dir, `counter-${cgb}-blank.ram`);
      const saved = path.join(dir, `counter-${cgb}-saved.ram`);
      const reset = path.join(dir, `counter-${cgb}-reset.ram`);
      fs.writeFileSync(blank, Buffer.alloc(8192, 255));
      const common = { rom: demoROM, cgb, symbols: path.join(root, 'build/runtime-save-counter.sym'),
        symbolNames: Object.fromEntries(demo.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])) };
      cases.push({ ...common, name: `save-counter-${cgb}-write`, ram_in: blank, ram_out: saved,
        variables: { score: 0, best: 0, muted: 0, volume: 5, saved: 1 }, steps: [
          { press: ['a'], frames: 12, variables: { score: 1, best: 1, saved: 1 } }, { release: ['a'], frames: 8 },
          { press: ['a'], frames: 12, variables: { score: 2, best: 2 } },
          { release: ['a'], press: ['left'], frames: 12, variables: { volume: 4 } },
          { release: ['left'], press: ['select'], frames: 12, variables: { muted: 1 } }
        ] });
      cases.push({ ...common, name: `save-counter-${cgb}-restart-reset`, ram_in: saved, ram_out: reset,
        variables: { score: 2, best: 2, muted: 1, volume: 4, saved: 1 }, steps: [
          { press: ['b'], frames: 12, variables: { score: 1, best: 2 } },
          { release: ['b'], press: ['start'], frames: 12, variables: { score: 0, best: 2 } },
          { release: ['start'], press: ['up'], frames: 30, variables: { score: 0, best: 0, muted: 0, volume: 5, saved: 1 } }
        ], screenshot: path.join(root, 'build', `save-counter-${cgb ? 'cgb' : 'dmg'}.png`) });
      cases.push({ ...common, name: `save-counter-${cgb}-restart-erased`, ram_in: reset,
        variables: { score: 0, best: 0, muted: 0, volume: 5, saved: 1 } });
    }

    const starFile = path.join(root, 'examples/star-chase/main.pysn');
    const star = compile(fs.readFileSync(starFile, 'utf8'), starFile);
    const starAsm = path.join(dir, 'star-chase.asm');
    fs.writeFileSync(starAsm, star.assembly);
    const starROM = assemble(starAsm, 'runtime-save-star-chase');
    const shared = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [`includes.state.${name}`, value]));
    for (const cgb of [false, true]) {
      const blank = path.join(dir, `star-${cgb}-blank.ram`);
      const won = path.join(dir, `star-${cgb}-won.ram`);
      const lost = path.join(dir, `star-${cgb}-lost.ram`);
      fs.writeFileSync(blank, Buffer.alloc(8192, 255));
      const common = { rom: starROM, cgb, symbols: path.join(root, 'build/runtime-save-star-chase.sym'),
        symbolNames: Object.fromEntries(star.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])) };
      cases.push({ ...common, name: `star-save-${cgb}-win`, ram_in: blank, ram_out: won,
        variables: shared({ screen: 0, score: 0, high_score: 0 }), steps: [
          { press: ['a'], frames: 30, variables: shared({ screen: 1, score: 0 }) }, { release: ['a'], frames: 4 },
          { set: shared({ score: 9, player_x: 4, player_y: 12, star_x: 5, star_y: 12, enemy_x: 18, enemy_y: 4, enemy_ticks: 0, move_ticks: 0 }),
            press: ['right'], frames: 30, variables: shared({ screen: 3, score: 10, high_score: 10 }) }
        ] });
      cases.push({ ...common, name: `star-save-${cgb}-restart-lower-score`, ram_in: won, ram_out: lost,
        variables: shared({ screen: 0, score: 0, high_score: 10 }), steps: [
          { press: ['a'], frames: 30, variables: shared({ screen: 1, score: 0, high_score: 10 }) }, { release: ['a'], frames: 4 },
          { set: shared({ score: 3, player_x: 4, player_y: 12, enemy_x: 4, enemy_y: 12, enemy_ticks: 0, move_ticks: 0 }),
            frames: 30, variables: shared({ screen: 2, score: 3, high_score: 10 }) }
        ] });
      cases.push({ ...common, name: `star-save-${cgb}-restart-best`, ram_in: lost,
        variables: shared({ screen: 0, score: 0, high_score: 10 }) });
    }

    const manifest = path.join(dir, 'cases.json');
    fs.writeFileSync(manifest, JSON.stringify(cases));
    const result = spawnSync(python, [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 90000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    console.log(result.stdout.trim());
    for (const output of outputs) {
      const written = fs.readFileSync(output.written);
      assert.equal(written.length, output.bytes);
      output.slots.forEach((slot, index) => {
        const value = output.values[index] & 65535;
        assert.deepEqual([...written.subarray(slot * 8, slot * 8 + 8)], [80, 89, 1, value & 255, value >> 8, (~value) & 255, (~value >> 8) & 255, 165]);
      });
      const cleared = fs.readFileSync(output.cleared);
      for (let offset = 7; offset < cleared.length; offset += 8) assert.equal(cleared[offset], 0);
    }
  });
