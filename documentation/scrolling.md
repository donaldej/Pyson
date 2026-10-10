# Scrolling worlds and camera

Draw a world larger than the visible 160x144 screen, then move a camera through
it in pixels. This first version supports the existing maps up to 32x32 tiles
(256x256 pixels) on both original Game Boy and Game Boy Color. For larger maps
and more total tile graphics, use [streaming worlds](worlds.md).

The example includes a custom noise effect when entering water, a start sound,
and a victory chime. See [sound effects](sound.md) for custom effect declarations.

Player idle/walk sequences use [animation helpers](animation.md) and
`world_animated_sprite()`, retaining the same camera, collision, and HUD behavior.

```python
header.target = "dual"
board = tilemap("assets/world.bmp")
hero = sprite_sheet("assets/hero.bmp")

player_x = 100  # World pixels, not screen pixels.
player_y = 90

draw_world(board)
while True:
    wait_vblank()
    # Movement and collision logic update player_x/player_y here.
    set_camera(player_x - 76, player_y - 68)
    world_sprite(0, hero, 0, player_x, player_y)
    refresh_screen()
```

Subtracting 76 and 68 centers an 8x8 player sprite on screen except near world
edges, where the camera is clamped. These offsets are choices in game code;
the compiler does not automatically follow a particular object.

## Routines

| Call | Behavior |
| --- | --- |
| `draw_world(map)` | Select and load a BMP or nested graphical map into the complete hardware background map. A newly loaded world resets the camera to `(0, 0)`. |
| `set_camera(x, y)` | Queue the top-left world pixel shown on screen, clamped to the currently loaded map. |
| `camera_x()` / `camera_y()` | Return the clamped queued camera position in pixels. |
| `world_sprite(slot, sheet, frame, x, y, flip_x=False, flip_y=False)` | Draw a sprite using world pixels, subtracting the current camera. Other arguments match `sprite()`. |

Integer expressions may be positional or [named](arguments.md). `set_camera` has no effect before
a valid world has been loaded. Invalid map handles and collision-only maps passed
to `draw_world` have no effect. A map smaller than the screen cannot scroll along
that axis; the unused area is filled with blank tiles.

For a map W tiles wide and H tiles high, the camera bounds are:

- X: `0..max(0, W * 8 - 160)`.
- Y: `0..max(0, H * 8 - 144)`.

A 32x32 map therefore allows camera X 0..96 and Y 0..112. Negative requests clamp
to zero; large positive requests clamp to the far edge. There is no wraparound.

`draw_world` loads a map only when changing worlds or after `clear_screen()`.
Calling it again for the current world preserves the camera and background
edits. A world is static in ROM; this API does not add mutable map cells.

## Coordinates, sprites, and collision

World sprite coordinates remain independent of the camera. Call `set_camera`
before drawing world sprites, and redraw them whenever the camera or their world
positions change. `world_sprite` queues screen coordinates for that call; it does
not retain an automatic camera binding for future frames. Partially visible
sprite components at the screen edges are supported, and fully offscreen
components are hidden. Existing sprite slot limits and flips still apply.

Use ordinary `sprite()` for objects anchored to the screen; it ignores the
camera. Both routines share the same hardware sprite slots.

Collision and terrain queries remain in **world tile coordinates**:

```python
next_x = player_x + 1
left = next_x // 8
right = (next_x + 7) // 8
top = player_y // 8
bottom = (player_y + 7) // 8
if not tile_is_solid(board, left, top) and not tile_is_solid(board, right, top) and not tile_is_solid(board, left, bottom) and not tile_is_solid(board, right, bottom):
    player_x = next_x
```

Check every cell touched by the object's proposed bounds. Do not subtract the
camera before querying terrain. `tile_at`, `tile_terrain`, and map dimensions
continue to read the original map regardless of camera movement.

## Refresh and screen transitions

Camera movement is buffered with the other graphics. `refresh_screen()` commits
camera registers, palettes, and queued sprites at VBlank. Without window
routines, changed backgrounds are prepared in a hidden map; programs using a
[fixed window HUD](window.md) reserve that map for the window and pause the LCD
for bulk background uploads.
Camera-only changes also refresh correctly. Getters return the queued position;
the hardware display still uses its previous position until refresh.

`clear_screen()` resets the camera to `(0, 0)` and invalidates the selected world.
It remains buffered; call `refresh_screen()` to display that change. Hide any
world sprites explicitly when switching to a title, menu, or result screen.
Calling `draw_world` after clearing reloads its original layout.

The camera scrolls the entire background layer. `print()` and `draw_map()` write
the existing background buffer and their contents scroll with it; they are not
fixed HUD elements while the camera is active. The existing coordinate limits
for those routines remain 20x18 tiles. For stationary screens, clear the screen
first. Use [window text](window.md) for a fixed HUD independent of the camera.

## Storage and limits

The complete map fits in the Game Boy's 32x32 hardware background map. Camera
movement uses the hardware pixel scroll registers, avoiding per-frame map
reconstruction. Loading a world or synchronizing a changed buffer can take
several frames; after both background buffers are synchronized, scrolling alone
does not copy map rows. Movement timing is still measured in game-loop updates,
not guaranteed hardware frames.

Programs using this API expand background tile and palette-attribute buffers
from 18 to 32 rows. Together this costs 896 additional bytes of WRAM, plus 14
more dirty-row bytes. Non-scrolling programs keep the existing buffer sizes.
The camera state is small fixed runtime storage; game variables and arrays must
still fit available WRAM. Graphics still share the 256-tile pool and imported
palette limits. Static graphics and maps use [automatic ROM banking](banking.md); user-defined functions are banked too.

Maps larger than 32x32, tile streaming, and map wrapping remain
future features. [Window text](window.md) now provides a fixed HUD.

## Playable example

The [scrolling-world example](../examples/scrolling-world/main.pysn) uses a 32x32
nested map with walls, slow water, and a gold star to find. The player moves one
pixel per update, with collision tested at all four corners. The camera follows
and stops at world edges. A result screen demonstrates returning to an unscrolled
background. A fixed bottom HUD displays world X/Y and the current terrain;
it is hidden on the result screen and restored on replay.

```powershell
npm.cmd run build -- examples/scrolling-world/main.pysn scrolling-world
```

Open `binary/scrolling-world.gb` in an emulator. A or Start starts/restarts, and
the D-pad moves. Water slows movement; collect the star near the bottom-right
corner. The example works in grayscale on DMG and in color on Game Boy Color.
