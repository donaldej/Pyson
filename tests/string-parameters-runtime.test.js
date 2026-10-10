'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const font = require('../src/font');
const root = path.resolve(__dirname, '..');
test('string pointers survive nested, named and banked helper calls on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/string-parameters');
  fs.mkdirSync(dir, { recursive: true });
  const source = `header.target = "dual"
message = "VARIABLE"
order = 0
def label(text, row=0):
    print(text, 0, row)
    return row + 1
def forward(text, row):
    alias = text
    return label(row=row, text=alias)
def next_row():
    global order
    order += 1
    return 4
def draw_hud(text):
    print_window(text, x=0, y=0)
    show_window()
def show_text(text):
    start_dialogue(text, speed=0)
    close_dialogue()
label("LITERAL")
forward(message, 1)
label(text=format_text("SCORE {}", 42), row=2)
nested = label("OUTER", label("INNER", 3))
named = label(row=next_row(), text="NAMED")
empty = label("", 5)
multiline = label("LINE1\\nLINE2", 6)
show_text("DIALOGUE")
draw_hud(format_text("HUD {}", 7))
window_position(x=0, y=136)
refresh_screen()`;
  const result = compile(source);
  const name = 'runtime-string-parameters';
  const asm = path.join(dir, name + '.asm');
  fs.writeFileSync(asm, result.assembly);
  const rom = assemble(asm, name);
  const row = (text, y) => ({ x: 0, y, tiles: [...text].map(char => font.ids.get(char)) });
  const cases = [false, true].map(cgb => ({ name: name + '-' + cgb, rom, cgb, frames: 120,
    symbols: path.join(root, 'build', name + '.sym'),
    symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
    variables: { order: 1, nested: 5, named: 5, empty: 6, multiline: 7 },
    rows: [row('LITERAL', 0), row('VARIABLE', 1), row('SCORE 42', 2), row('INNER', 3), row('NAMED', 4), row('LINE1', 6), row('LINE2', 7)],
    window_rows: [row('HUD 7', 0)], window_enabled: true
  }));
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
