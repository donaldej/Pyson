# Rectangle collision

`rect_overlap(ax, ay, aw, ah, bx, by, bw, bh)` returns 1 when two rectangles
overlap, otherwise 0. Coordinates identify each rectangle's top-left corner;
width and height specify its size. All eight integer parameters accept positional or [named arguments](arguments.md).

```python
if rect_overlap(shot.x, shot.y, 8, 8, enemy.x, enemy.y, 8, 8):
    despawn(shot)
    enemy.health -= 1
```

Rectangles include their left/top boundaries and exclude their right/bottom
boundaries. Two 8-pixel-wide rectangles at X=0 and X=8 touch but do not overlap;
moving the second to X=7 produces a one-pixel overlap. A zero or negative width
or height always returns 0. Containment counts as overlap.

Use coordinates from the same space: both world coordinates or both screen
coordinates. Negative positions are supported. Coordinates and sizes follow
Pyson's signed 16-bit rules, but endpoint comparisons preserve the extra carry,
so an internal `x + width` crossing 32767 does not wrap. Arithmetic in argument
expressions still follows ordinary signed 16-bit rules.

Hitboxes are independent of sprite artwork, visibility, animation, and palette.
You can inset them or give them sizes different from the drawn sprite. This
query does not move objects, resolve collisions, or detect objects that cross
each other completely between frames. Game code handles those behaviors.
For terrain, continue using [tile queries](collision.md).

Arguments evaluate once, from left to right. Records, array fields, and live
pool-handle fields can supply numeric arguments; stale pool handles retain their
existing runtime error behavior. Nested calls and helper functions are supported.
The routine uses 16 shared scratch bytes, included only in games calling it.

## Playable example

Build the collision lab to test edge contact directly:

```powershell
npm.cmd run build -- examples/collision-lab/main.pysn collision-lab
```

Move the 8×8 player with the D-pad into the 32×32 target. Its color changes and
`HIT` becomes 1 while the rectangles overlap. B resets the player. DMG displays
the numeric result; Color also displays the palette change.

```powershell
npm.cmd run build -- examples/pool-shooter/main.pysn pool-shooter
```

Pool Shooter now uses this helper for bullet/enemy collisions. Left/Right move,
hold A to fire, and B restarts. Each bullet and enemy has an 8×8 hitbox; enemies
take two hits. Its gameplay remains the same.
