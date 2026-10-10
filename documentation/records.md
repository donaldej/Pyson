# Records and record arrays

Records group related integer fields in fixed working RAM:

```python
player = record(x=40, y=80, health=3)
player.x += 2
print(player.health, 0, 0)

enemies = records(8, x=0, y=0, health=3, active=False)
enemies[0].active = True
enemies[-1].health -= 1
```

`record()` requires 1–32 named fields. Values are signed 16-bit integers or
booleans, with the usual integer wraparound. Fields cannot contain strings,
arrays, or other records. The field names establish a fixed schema; subsequent
assignments must retain exactly those names. Their declaration order may differ.
New fields cannot be added at runtime.

`records(count, ...)` creates independent inline records with identical fields.
The count must be a literal integer from 1 through 1024, and all storage must fit
available WRAM. Default expressions run once, left to right, each time the
initializer executes; their resulting values populate every element.

Lists can initialize individual records:

```python
enemies = [
    record(x=24, y=40, health=3),
    record(x=80, y=60, health=2),
]
```

Every element must have the same fields. Length stays fixed. `len(enemies)`,
integer indices, negative indices, and bounds checks work as for integer arrays.
A literal invalid index fails compilation; a runtime invalid index displays
`Index out of range` and stops the game.

## Helpers update the original

```python
def damage(enemy, amount):
    enemy.health -= amount

damage(enemies[0], 1)

for enemy in enemies:
    damage(enemy, 1)
```

Record arguments and record iteration variables reference the original storage.
Field updates therefore persist. These references cannot be rebound with
`enemy = ...`; update their fields instead. A helper parameter must always receive
records with the same fields. Integer parameters and integer return values work
as before. Returning records, passing whole record arrays, and passing temporary
constructors directly to helpers are not supported.

The compiler infers a record parameter's fields from its call sites. A helper
that accesses record fields therefore needs a call site with a known record
schema. Use a separate loop variable from owning records or helper parameters;
their storage cannot change into an iteration reference.

Updating a module record's field requires no `global`, because it does not
rebind the module variable. Imported records use the existing module namespace:
`state.player.x` or `state.enemies[i].health`. Modules initialize once and share
one allocation across their importers.

## Copies and reinitialization

```python
backup = player          # Independent copy, including when RHS is a reference.
backup.health = 99       # Does not change player.
enemies[0] = backup      # Copy into an existing element with the same fields.
player = record(x=player.y, y=player.x, health=player.health)
```

Ordinary assignments copy values; this differs from Python object aliasing.
The whole right-hand side is evaluated before any destination fields change.
Record arrays can be reinitialized using a same-length list or `records()`;
whole-array copies and aliases are not supported. To initialize an array element,
set its fields individually or copy an existing record.

## Storage and limits

Each field occupies two bytes, including booleans. A three-field record occupies
six bytes; eight such records occupy 48 bytes. Helper parameters and iteration
references occupy two bytes each. Owning records have no pointer or object-header
overhead. Fields are stored alphabetically, at fixed addresses, without a heap.

Builds write `build/<name>.memory.json` with each variable's address, reserved
bytes, field offsets, element stride, and reference status.
Reference field offsets describe the pointed-to record, rather than the two-byte
reference slot itself. The build prints total WRAM usage, including runtime
buffers and temporary variables. User storage
shares the 4096-byte WRAM0 area with those buffers; the separate CPU stack uses
WRAMX. Oversized allocations fail compilation or assembly. Storage remains
reserved for the ROM's lifetime, including inactive records and function locals.

For spawning and reusable handles, use [object pools](pools.md). Ordinary record
arrays still use explicit `active` fields if desired; reset all fields when
reactivating those records. Automatic reuse of ordinary variable memory, classes,
and methods are not implemented.

## Demo

```powershell
npm.cmd run build -- examples/record-fleet/main.pysn record-fleet
```

Open `binary/record-fleet.gb`. D-pad moves the player, Select chooses an enemy,
A reduces its health, and B resets the fleet. Four enemies move independently
using record references in imported helpers. The demo works on DMG and Color.
