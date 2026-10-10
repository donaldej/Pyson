# Tile queries and collision

BMP tile maps keep their automatic tile deduplication. Collision is separate
static data, so changing a palette does not change which cells are walls.

```python
board = tilemap("assets/board.bmp")
level = collision_map([
    "#####",
    "#...#",
    "#.#.#",
    "#...#",
    "#####",
])

player_x = 1
player_y = 1

def move_right():
    global player_x
    next_x = player_x + 1
    if not tile_is_solid(level, next_x, player_y):
        player_x = next_x
```

`collision_map(rows)` requires a top-level assignment with a literal list of
strings. Each `#` is solid and each `.` is walkable. Rows must have equal lengths;
both dimensions must be 1..32 tiles. Rows are compiled into ROM, with one bit per
cell and an eight-byte asset descriptor. A 20 by 13 map uses 33 bytes of collision
data; its named handle uses two bytes of WRAM. No graphics tiles or palettes are
allocated. These string lists are compile-time declarations, separate from the
language's mutable integer arrays. Collision maps are immutable.

| Routine | Result |
| --- | --- |
| `tile_is_solid(map, x, y)` | 1 for solid cells, 0 for walkable cells. Outside the map or an invalid/wrong-kind handle returns 1. Accepts a collision map or nested graphical map. |
| `rect_is_solid(map, x, y, width, height)` | 1 if any tile covered by a pixel rectangle is solid, or if its bounds or map are invalid; otherwise 0. |
| `map_width(map)` | Width in tiles, or -1 for an invalid/wrong-kind handle. Accepts BMP background maps, nested graphical maps, and collision maps. |
| `map_height(map)` | Height in tiles, or -1 for an invalid/wrong-kind handle. Accepts BMP background maps, nested graphical maps, and collision maps. |
| `tile_terrain(map, x, y)` | Terrain label 0..255 from a nested graphical map, or -1 outside the map or for an invalid/wrong-kind handle. |
| `tile_at(map, x, y)` | Compiled graphics tile ID (0..255), or -1 outside the map or for an invalid/wrong-kind handle. Accepts BMP background maps and nested graphical maps. |

Coordinates start at `(0, 0)` in the map. Negative coordinates do not wrap.
Drawing a map at a screen offset does not change its query coordinates. Star
Chase draws its board at `(0, 3)`, so its collision checks use screen tile X and
screen tile Y minus 3. Pixel coordinates must first be converted to tile
coordinates, for example `pixel_x // 8`.

Collision maps and BMP maps are independent handles; the compiler does not match
or validate their layouts. Keep their dimensions and wall positions consistent.
Imports can share the same declared collision map across screens and helpers.
Each imported module is compiled once.

`tile_at` reads the original compiled graphical map, regardless of where it was drawn,
what text or tiles currently cover it, or whether the screen has been refreshed.
Tile IDs are shared and deduplicated across assets and may change when assets
change. Compare queried IDs within the same compilation rather than hard-coding
IDs as terrain types. Collision maps provide explicit, stable solidity instead.

These queries also accept [mutable maps](mutable-maps.md) and immediately reflect
their current cells.

Queries accept expressions and perform runtime bounds checks. Checking a cell
only tests terrain: game code still handles enemy collisions, collectible objects,
movement timing, and sprite sizes. For an object larger than one tile, check every
cell its proposed bounds touch. Queries do not add pathfinding. [Scrolling worlds](scrolling.md) keep these
queries in world tile coordinates. Use [nested tile maps](tilemaps.md)
for manual lists of graphical tiles with built-in solidity and terrain labels.

Use [rectangle collision](rectangles.md) for enemy, bullet, pickup, and other
object hitboxes independent of terrain.

## Pixel hitboxes against terrain

```python
if not rect_is_solid(board, player_x + dx, player_y, 16, 16):
    player_x += dx
if not rect_is_solid(board, player_x, player_y + dy, 16, 16):
    player_y += dy
```

`rect_is_solid()` accepts five integer expressions, positionally or by their
[names](arguments.md): `map`, `x`, `y`, `width`, and `height`. X/Y are map pixel
coordinates, not tiles or screen coordinates. It checks every tile touched by
the rectangle, including interior cells. The right/bottom edges are exclusive:
an 8×8 rectangle at `(0, 0)` touches only tile `(0, 0)`.

Negative coordinates, nonpositive sizes, bounds outside the map, and invalid or
wrong-kind handles return 1. Collision maps, nested graphical maps and streamed
worlds use their existing solidity rules. Ordinary BMP maps have no collision
metadata and therefore return 1, just as `tile_is_solid()` does. Internal endpoint
calculations do not wrap at signed 16-bit limits; arithmetic in your argument
expressions still follows normal integer rules.

The helper checks the proposed position, not the path traveled to it. Use small
movement steps or subdivide large moves to avoid passing through thin walls.
Checking the two axes separately lets a player slide along walls. It does not
automatically move or push objects. Queries use the map's current collision data,
independent of camera position and graphics edits.

Arguments evaluate once from left to right. The runtime scans until it finds a
solid cell; its cost grows with the number of covered tiles. Prefer ordinary
object-sized hitboxes over repeatedly scanning an entire level. The helper adds
six shared scratch bytes and its runtime only when used.

The [streaming-world demo](../examples/streaming-world/main.pysn) now uses this
query for its 8×8 player and checks each movement axis separately. D-pad moves;
A jumps between world regions.

The [Star Chase example](../examples/star-chase/main.pysn) now uses a
[nested graphical map](tilemaps.md), whose tiles supply solidity and terrain
properties directly. Player movement, enemy movement, and star placement query
that same board; no separate collision layout is needed.

## Streamed worlds

The same query routines accept [worldmap assets](worlds.md), including cells
outside the loaded graphics region. World tile IDs are stable within each world
and can exceed 255. BMP worlds can declare collision rows directly; nested
worlds retain each tile's solidity and terrain.
