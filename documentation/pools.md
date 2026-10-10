# Reusable object pools

A pool reserves a fixed number of record slots for objects such as bullets,
enemies, particles, or pickups:

```python
bullets = pool(16, x=0, y=0, dx=2)
shot = spawn(bullets, x=40, y=80)
if shot:
    shot.x += shot.dx
    if shot.x > 160:
        despawn(shot)
```

`pool(capacity, field=default, ...)` declares 1–128 slots and 1–32 named fields.
Capacity and defaults must be literal integers or booleans. Fields follow the
usual signed 16-bit integer rules. Declare pools once at module top level;
function-local pools, conditional declarations, rebinding, and whole-pool copies
are rejected. Modules share one allocation across importers.

## Spawning and removal

`spawn(pool, field=value, ...)` chooses the lowest available slot. It restores
**every** field to its declared default, then applies the supplied overrides.
Overrides can be runtime integer expressions. Expressions are evaluated left to
right before allocation, even when the pool is full. Unknown or duplicate fields
are compile errors.

The result is a handle. `if shot:` tests whether it still names an active object.
A full pool returns an empty, false handle; existing objects are never evicted.
There is no automatic growth or heap allocation.

`despawn(handle)` frees the slot, returning `1` if it removed a live object and
`0` for an empty or stale handle. Calling it repeatedly is safe.

`reset_pool(pool)` removes every active object without changing capacity or
defaults. Old handles remain invalid when those slots are reused. Reset does not
reset generation counters or restore retired slots.

## Handles and safety

```python
first = spawn(bullets)
saved = first             # Copies the handle, referencing the same object.
despawn(first)
replacement = spawn(bullets)
if saved:
    saved.x += 1         # This branch is skipped; saved is stale.
```

Handle assignment copies the slot identity, unlike owning record assignment,
which copies field values. A handle contains a two-byte slot address and a
four-byte generation. Every field read and write checks that identity against
the active slot. An empty or stale handle's field access displays
`Invalid pool handle` and stops the game instead of modifying a replacement.
Check handle truth before accessing uncertain references.

Generation counters never wrap: after 4,294,967,295 allocations of a particular
slot, that slot permanently retires when released. Spawning skips retired slots.
This prevents an extremely old handle from becoming valid again.

Helpers can accept handles and mutate their fields:

```python
def advance(shot):
    shot.x += shot.dx

if shot:
    advance(shot)
```

The compiler infers the handle's pool from call sites. Each helper parameter and
handle variable is tied to one pool, even if another pool has identical fields.
Handles cannot be returned from user functions or placed in ordinary integer
arrays. Whole pools cannot be passed as helper parameters. Field schemas remain
fixed; nested records, strings, and dynamic fields are unsupported.

## Iteration and queries

```python
for shot in bullets:
    shot.x += shot.dx
    if shot.x > 160:
        despawn(shot)
```

Iteration scans each slot once in ascending order, visiting only slots active
when reached. Removing the current object is safe. An object spawned into a later
slot can be visited in the same pass; one spawned into an already visited slot
waits until the next pass. Resetting a pool during iteration makes subsequent
inactive slots skip. After removing the current object, its handle is stale.
Do not read its fields afterward without checking it again.

| Query | Result |
| --- | --- |
| `len(pool)` | Fixed capacity, including retired slots |
| `pool_count(pool)` | Number of active objects |
| `pool_index(handle)` | Zero-based slot index, or `-1` for an invalid handle |

`pool_index()` is useful for assigning stable sprite slots. Pools do not support
direct numeric indexing; use spawn results and active iteration.

## Memory and compilation

Each slot reserves five metadata bytes plus two bytes per field. A 16-slot,
three-field pool uses **176 bytes**. Each named handle, helper parameter, and
iteration variable uses six bytes. Spawn sites and augmented field assignments
also reserve six-byte handle temporaries; iteration uses four bytes of counters.
The pool runtime reserves 13 shared scratch bytes only in games declaring pools.
Defaults and pool descriptors live in ROM.

Builds report total WRAM usage and write `build/<name>.memory.json`. Pool field
offsets include the five-byte slot header. All slots, including inactive ones,
remain reserved for the ROM's lifetime. Pool runtime code is omitted from games
that do not declare pools.

## Shooter demo

```powershell
npm.cmd run build -- examples/pool-shooter/main.pysn pool-shooter
```

Open `binary/pool-shooter.gb` on DMG or Color. Left/right move, holding A fires,
and B restarts. Enemies take two hits. Twelve bullets and four enemies occupy
separate pools; objects leaving the screen or being destroyed release their slots.
