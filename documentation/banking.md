# Automatic ROM banking

Static graphics, maps, and user-defined functions are automatically placed in
16 KB ROM banks. Existing
`.pysn` calls are unchanged: `draw_map`, `draw_world`, `sprite`, and tile queries
select the correct bank before reading their data.

```python
header.target = "dual"
board = tilemap("assets/board.bmp")
draw_world(board)
refresh_screen()
```

## Placement and cartridge selection

The shared font and imported tile graphics live in bank 1. Map layouts, nested
map definitions, packed collision data, and sprite frame tables fill available
banks in declaration order. Functions then fill available space in definition order. Each object stays entirely within one bank;
the compiler rejects an object larger than 16 KB. Reused BMP imports and shared
tile graphics retain their existing deduplication.

When `header.controller` is omitted, small games use `rom_only`. If assets or functions need
more than bank 1, the compiler selects `mbc5` automatically. An explicit ROM
capacity above 32 KB also selects MBC5 when no controller was specified.
An explicit controller is always respected:

```python
header.controller = "mbc3"
header.rom_kb = 128
```

`header.rom_kb = 0` sizes the output to the smallest supported power of two that
contains its banks, starting at 32 KB. An explicit capacity pads the ROM and
must accommodate every placed asset and function. Explicit `rom_only` projects fail with a
clear capacity error if bank 1 fills. No source-level bank numbers are needed.

| Controller | Asset and function bank numbers | Maximum ROM capacity |
| --- | --- | --- |
| `rom_only` | 1, permanently mapped | 32 KB |
| `mbc1` | 1..127, skipping 32, 64, 96 | 2048 KB |
| `mbc3` | 1..127 | 2048 KB |
| `mbc5` | 1..511 | 8192 KB |

MBC1 uses simple mode so executable bank 0 remains mapped. Its inaccessible
switchable banks are skipped; MBC1 ROMs of 1024 KB or more support at most 8 KB
external RAM. MBC5 writes both bank-register parts, including the ninth bit.
See the hardware references for [MBC1](https://github.com/gbdev/pandocs/blob/master/src/MBC1.md),
[MBC3](https://github.com/gbdev/pandocs/blob/master/src/MBC3.md), and
[MBC5](https://github.com/gbdev/pandocs/blob/master/src/MBC5.md).

## Function calls and shared state

Functions use ordinary Python-like syntax; bank placement needs no annotations:

```python
def add(a, b):
    return a + b

result = add(1, add(2, 3))
```

Each function stays within a single bank. Split a function whose generated code
exceeds 16,383 bytes into smaller helpers. Small functions share banks with other
functions and graphics; even a ROM-only cartridge can use its fixed bank 1 for code.

Calls go through a routine in permanently mapped ROM bank 0. It selects the
callee's bank, saves the caller's execution bank on the CPU stack, and restores
that bank before returning the numeric result. Nested calls and nested argument
expressions work across banks. Recursion remains unsupported.

Runtime routines and asset descriptors stay in bank 0. When a banked function
calls a runtime routine, a shared wrapper restores the function's bank afterward.
This includes graphics readers, save routines, screen refresh, audio, array access,
and arithmetic. Runtime results and comparison flags survive restoration.

Variable storage is unchanged: globals, imported module state, function parameters,
and locals retain their statically assigned WRAM addresses. Importing a function
from multiple screens emits it once. Banking increases code capacity, not working
RAM, and does not implement the shelved automatic reuse of variable memory.

Programs with functions use two additional WRAM bytes for the execution bank.
Each function call occupies six stack bytes while its callee is active (four more
than a direct CPU call), plus expression and runtime scratch pushes. Calls and
runtime returns also spend CPU time switching banks. Programs without functions
omit the bank-call routine and these two WRAM bytes.

## Build output and current limits

`build/<name>.banks.json` records the selected controller, required and output
capacities, and each object's bank, address, and byte count. The asset manifest
also includes `bank`, `address`, and `romBytes`. Debugger symbols contain banked
addresses. The output header and checksums reflect the final ROM capacity.

The manifest marks functions with `kind: "function"` and records their qualified
name, source file, line, exact byte count, address, and bank. RGBDS assertions
verify each function's generated size during assembly.

Main's top-level executable statements, runtime routines, text strings, integer
array initialization data, palettes, sound/music sequences, and sprite animation
definitions still occupy bank 0 and must fit its remaining space. Put large screen
or gameplay routines in functions rather than expanding them in the main scaffold.
Increasing capacity cannot fix overflow in the remaining fixed-bank content;
runtime and static-definition banking are future work.

Banking does not enlarge working RAM, VRAM, the shared 256-tile pool, palette
limits, or the maximum 32x32 map size. It lets more layouts and sprite frame
tables reuse those graphics across screens. One byte per asset bank is reserved
for ROM capacity padding.

## Banked worlds example

```powershell
npm.cmd run build -- examples/banked-world/main.pysn banked-world
```

The example has 18 different 32x32 room layouts using only brick and floor tiles.
It produces a 64 KB MBC5 ROM without explicit cartridge or bank configuration.
A advances to the next room, B returns to the previous room, and the D-pad pans
the camera. The fixed bottom HUD and menu sounds continue working across banks.

## Banked functions example

```powershell
npm.cmd run build -- examples/banked-functions/main.pysn banked-functions
```

Open `binary/banked-functions.gb`. A or B switches between two room designs.
Its drawing functions contain over 24 KB of compiled code spread across banks
1 and 2, producing a 64 KB MBC5 ROM automatically. They call graphics readers in
bank 1 while executing from bank 2, demonstrating restoration before execution
continues. Shared state, text, and menu sounds also work through banked calls.

The drawing statements are deliberately expanded to exercise code capacity. A
nested tilemap or drawing loops would represent these particular rooms more
compactly in a normal game.

## Streaming world data

[Streaming worlds](worlds.md) add banked collision chunks, working-window
graphics, layouts and metadata. The existing automatic placement and cartridge
sizing apply to these objects. Region selection and tile queries switch to the
required data banks; user function execution restores its original bank.
