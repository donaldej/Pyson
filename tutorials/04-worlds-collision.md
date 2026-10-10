# 4. Worlds, collision, and HUDs

Goal: distinguish world coordinates from screen coordinates and make terrain
affect gameplay without maintaining an unrelated collision layout.

## Step 1: explore a camera-driven world

Build [Scrolling World](../examples/scrolling-world/main.pysn):

```powershell
npm.cmd run build -- examples/scrolling-world/main.pysn scrolling-world
```

Follow the title prompt, move with the D-pad, and watch the camera and HUD.
In the source, skip the large board definition initially and find `can_move`,
`update_hud`, and `update_game`. Then return to the tile definitions.

```python
brick = tile("assets/brick.bmp", solid=True, terrain=1)
water = tile("assets/water.bmp", terrain=2)
```

Solid means blocking; terrain is a game-defined numeric label. Terrain 2 is
not intrinsically water—the example chooses that meaning and applies behavior.
Nested map rows become static ROM data rather than runtime Python nested arrays.
Repeated graphics are deduplicated.

## Step 2: keep coordinate systems distinct

The player position is in world pixels. `set_camera(player_x - 76,
player_y - 68)` requests a camera near the player; the runtime clamps it to
world bounds. `world_animated_sprite` subtracts the camera when drawing.

Tile queries instead use map-local tile coordinates. The source obtains terrain
using `tile_terrain(board, player_x // 8, player_y // 8)`.
Collision must account for an object's whole rectangle, not just its origin.
Read the example's movement checks before changing its sprite size.

The window HUD uses `print_window` and `window_position`, so its coordinates
do not scroll with the world. Ordinary `print` writes the background instead.

## Step 3: change terrain at runtime

Build [Feature Lab](../examples/feature-lab/main.pysn):

```powershell
npm.cmd run build -- examples/feature-lab/main.pysn feature-lab
```

Move to the doorway at map Y=40 and press A. The example uses `mutable_map`
and `set_map_tile` to change both artwork and collision. It avoids closing a
door on an occupied player. The `advance` helper uses swept `move_x`/`move_y`
so faster movement stops at walls rather than skipping through them.

## Try it

In a copy of Feature Lab, change `SPEED = constant(3)` to 4. Verify that the
player still stops at the divider and slides along it. Check both open and
closed door states. A visual change alone is not enough: gameplay collision
must agree with the map after editing.

References: [tile maps](../documentation/tilemaps.md),
[collision](../documentation/collision.md), [movement](../documentation/movement.md),
[mutable terrain](../documentation/mutable-maps.md), [window HUDs](../documentation/window.md).

[Previous](03-screens-modules.md) · [Next: records and pools](05-actors-pools.md)
