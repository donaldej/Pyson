# Persistent save data

Save routines store signed 16-bit integers in battery-backed cartridge RAM.
They work on original Game Boy and Game Boy Color, and survive a restart when
the emulator or cartridge preserves that RAM. Ordinary variables remain in
working RAM; explicitly write values that should persist.

```python
high_score = save_read(0, 0)

def record_score(score):
    global high_score
    if score > high_score:
        if save_write(0, score):
            high_score = score
```

## Routines

| Call | Result |
| --- | --- |
| `save_read(slot, default=0)` | Return the saved value, or the default if the slot is blank, deleted, damaged, or out of range. |
| `save_write(slot, value)` | Write immediately and verify the record; return `True` on successful readback, otherwise `False`. |
| `save_exists(slot)` | Return `True` if the slot contains a valid committed value. A saved zero counts as existing. |
| `save_delete(slot)` | Invalidate one slot. Return `True` if deletion is verified, including an already empty slot; invalid indices return `False`. |
| `save_clear()` | Invalidate every save slot in every configured RAM bank. Returns no value. |
| `save_capacity()` | Return the number of available slots. |

Parameters accept positional or [named arguments](arguments.md), including
`save_read(slot=0, default=-1)`. Slots are integer indices from 0 through
`save_capacity() - 1`. Invalid literal slots are compile errors. Invalid dynamic
slots leave storage untouched; reads return their default and writes, existence
checks, and deletion return `False`.

Values and defaults follow the language's signed 16-bit integer rules, including
wraparound. Booleans use 0/1. Strings and arrays cannot be passed directly.
`save_read()` does not create a slot when returning its default.

There is no buffered commit routine: `save_write()` writes before returning.
`refresh_screen()` is not required to commit a save. Saving and clearing are
synchronous; clear walks the entire configured storage, so use it for an explicit
reset or migration rather than in every frame.

## Cartridge configuration

Using any save API automatically supplies these settings when omitted:

```python
header.controller = "mbc5"
header.ram_kb = 8
header.battery = True
```

An omitted controller selects MBC3 instead if `header.rtc = True` was configured.
Explicit header settings always take precedence. Explicit `rom_only`, zero RAM,
or `battery = False` cannot provide persistent saves and produce a compile error.
The normal [header compatibility rules](header.md) still apply. You can choose a
controller and more RAM explicitly:

```python
header.controller = "mbc3"
header.ram_kb = 32
header.battery = True
```

| Cartridge RAM | Save slots | Supported controllers |
| --- | --- | --- |
| 8 KB | 1024 | MBC1, MBC3, MBC5 |
| 32 KB | 4096 | MBC1, MBC3, MBC5 |
| 64 KB | 8192 | MBC5 |
| 128 KB | 16384 | MBC5 without rumble |

The save system owns the configured cartridge RAM. Each slot occupies eight
bytes, with two bytes available for its value and six for validation. Slots
1024, 2048, etc. begin successive 8 KB RAM banks. This implementation adds no
save-specific working RAM buffers. Games with no save calls keep their usual
cartridge defaults and include no save runtime.

The runtime enables RAM only during an operation and disables it afterward.
MBC1 with multiple RAM banks temporarily selects RAM banking mode and restores
simple mode. Such cartridges must have ROM capacity at most 512 KB; MBC1 ROMs
of 1024 KB or more permit at most 8 KB RAM. MBC3 RAM access does not latch its
clock; MBC5 rumble cartridges use only RAM bank bits below the motor bit. ROM
asset calls continue selecting their own banks.

Hardware references: [MBC1](https://github.com/gbdev/pandocs/blob/master/src/MBC1.md),
[MBC3](https://github.com/gbdev/pandocs/blob/master/src/MBC3.md), and
[MBC5](https://github.com/gbdev/pandocs/blob/master/src/MBC5.md).

## Slot ownership, arrays, and modules

Choose stable indices for each field and share their meaning between screens.
Imported helper modules use the same slots as the main program. Slots are not
allocated by variable name or namespaced by module. Changing function names or
variable names does not change stored data; changing a slot's meaning can.

```python
# includes/progress.pysn
def load_level():
    return save_read(1, 1)

def store_level(level):
    return save_write(1, level)
```

Serialize a fixed integer array into a consecutive range:

```python
inventory = [0, 0, 0, 0]
for i in range(len(inventory)):
    inventory[i] = save_read(20 + i, 0)

def save_inventory():
    for i in range(len(inventory)):
        if not save_write(20 + i, inventory[i]):
            return False
    return True
```

Keep active game state in ordinary variables and write at checkpoints, when a
setting changes, or when a round ends. Multi-field saves are separate writes;
there is no atomic transaction spanning an inventory or complete save file.

## Defaults, integrity, and game versions

Each record contains the signature `PY`, format version 1, a little-endian
value, its inverted bytes, and a final commit marker. Writes invalidate the
marker first, write the other fields, then commit last and verify readback.
Blank or erased RAM, unknown format versions, mismatched inverted bytes, and
uncommitted records are rejected. This provides basic corruption detection;
it is not a checksum over a whole game save or a redundant backup. An interrupted
overwrite can lose that slot's previous value, causing a later read to use its
default. `save_clear()` invalidates records rather than zeroing every byte.

Use a separate game schema field when later releases change slot meanings:

```python
# Slot 0 belongs to the game's schema version, independently of record format 1.
if save_read(0, -1) != 2:
    save_clear()
    save_write(0, 2)
level = save_read(1, 1)
```

This example deliberately resets an older schema. A game can instead read its
old slots and migrate them before updating the schema field. `header.version`
is cartridge metadata and does not automatically erase or migrate saves.

## Emulator workflow and examples

```powershell
npm.cmd run build -- examples/save-counter/main.pysn save-counter
```

Open `binary/save-counter.gb`. A/B adds/subtracts, Left/Right changes volume,
Select toggles mute, Start resets the current score while retaining the best,
and Up erases all demo progress and settings. Close the emulator normally and
open the same ROM again to check persistence. Keep its cartridge save file:
emulators commonly use `.sav` or `.ram`, depending on the emulator. Emulator
save states are a separate feature and are not needed for cartridge saves.

The compiler writes `build/<name>.save.json` with save enablement, slot count,
RAM bank count, record size, and format version. It does not create an initial
save file or overwrite an existing one during compilation.

Star Chase now records its best star count when a round ends and displays it on
the title and result screens. Resetting a round leaves that high score intact.
