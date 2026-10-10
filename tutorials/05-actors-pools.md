# 5. Records and object pools

Goal: keep an actor's related values together, then manage temporary actors
without dynamic allocation or unrelated parallel arrays.

## Step 1: use named fields

Build [Record Fleet](../examples/record-fleet/main.pysn):

```powershell
npm.cmd run build -- examples/record-fleet/main.pysn record-fleet
```

Move with the D-pad, select an enemy with Select, damage it with A, and reset
with B. Open [its state module](../examples/record-fleet/includes/state.pysn):

```python
player = record(x=76, y=88)
enemies = records(4, x=0, y=0, dx=1, health=3, active=True)
```

A record groups fixed numeric fields. A record array reserves four such objects.
The schema and capacity do not change at runtime. Find `damage(enemy)` and its
call in main: the helper updates the original enemy through a reference, rather
than returning a modified copy. These are not full Python classes.

## Step 2: use pools for temporary actors

Build [Pool Shooter](../examples/pool-shooter/main.pysn):

```powershell
npm.cmd run build -- examples/pool-shooter/main.pysn pool-shooter
```

Move left/right, hold A to fire, and press B to restart. In
[pool state](../examples/pool-shooter/includes/state.pysn), find:

```python
bullets = pool(12, x=0, y=0, dy=-3)
```

Main calls `spawn(state.bullets, x=..., y=...)`. Spawn returns a checked handle
or a false value when no usable slot is available. Always handle that outcome.
`for shot in state.bullets` visits active actors. The movement helper despawns
shots that leave the play area; enemy collision despawns defeated enemies.

Do not retain a removed handle and assume it now names a replacement actor.
Handles carry identity information and are validated. Consult the pool reference
for stale handles, reset behavior, and eventual slot retirement.

## Step 3: distinguish memory capacity from drawing capacity

A pool allocates fixed working RAM at compilation. It does not grow on demand.
An actor being active does not automatically reserve an appropriate sprite slot.
Read the drawing loop to see how slots are assigned, and remember the ten-sprite
scanline limit. More RAM actors do not mean all can be displayed together.

## Try it

In a copy, reduce bullet capacity from 12 to 2. Holding A should make unavailable
spawns more common, while existing shots still move and despawn. Observe the
`blocked_shots` handling rather than treating a failed spawn as a valid shot.

References: [records](../documentation/records.md), [pools](../documentation/pools.md),
[rectangle collision](../documentation/rectangles.md).

[Previous](04-worlds-collision.md) · [Next: finishing game systems](06-game-systems.md)
