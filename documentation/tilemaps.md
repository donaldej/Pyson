# Nested tile maps and terrain

Build a background from reusable 8x8 BMP tiles. Each tile can carry collision
and terrain properties, so graphics and gameplay use the same layout.

```python
header.target = "dual"
brick = tile("assets/brick.bmp", solid=True, terrain=1)
floor = tile("assets/floor.bmp")
water = tile("assets/water.bmp", terrain=2)

board = tilemap([
    [brick, brick, brick, brick, brick],
    [brick, floor, floor, water, brick],
    [brick, floor, floor, floor, brick],
    [brick, brick, brick, brick, brick],
])

draw_map(board, 0, 3)
refresh_screen()
```

This example is five tiles wide and four tiles high. Outer lists describe rows;
each inner list describes that row's columns. There is no implied screen size.
Use `map_width(board)` and `map_height(board)` for its dimensions.

## Declaring tiles

`tile(path, solid=False, terrain=0, x=0, y=0)` requires a top-level assignment. The path
must be a literal string. Without `x` or `y`, the BMP must be exactly 8x8 pixels. Paths resolve
relative to the source file declaring the tile, including imported modules.
The existing BMP formats, color conversion, and shared tile deduplication apply.

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `solid` | Literal `True` or `False` | `False` | Whether this tile blocks terrain movement |
| `terrain` | Literal integer 0..255 | `0` | A game-defined label for the kind of ground |
| `x`, `y` | Literal integers 0..31, inside the image | `0` | Select one 8x8 tile from a larger BMP |

Options use Python keyword syntax and may appear in either order. Repeated or
unknown options are rejected. Fixed-parameter built-ins and user-defined
functions support [named arguments](arguments.md). Field constructors and
variable-length APIs retain their documented special rules.
Tiles must be declared before maps that reference them.

### Taking tiles from one image

A tileset, also called an atlas, is simply a BMP with several tiles next to one
another. You can keep your floor, wall and water artwork in one image:

```python
floor = tile("assets/tileset.bmp", x=0, y=0)
wall = tile("assets/tileset.bmp", x=1, y=0, solid=True)
water = tile("assets/tileset.bmp", x=0, y=1, terrain=2)
```

Coordinates count **tiles, not pixels**, starting at the top-left corner. Thus
`x=1` selects the tile eight pixels to the right. Omit one coordinate to use zero
for that axis. The source dimensions must be multiples of eight and at most
256x256 pixels, with at most 256 distinct patterns in the source image.

Selections from the same BMP share one background palette. Its four colors are
chosen from the whole image, so each selected tile keeps consistent colors.
Only selected patterns enter the resident tile pool. Solidity and terrain still
belong to each declaration; two selections of the same artwork can have different
gameplay properties. Out-of-range coordinates are compile errors.

[Prism Forge](../examples/prism-forge/README.md) uses an atlas and nested maps
to create animated full-screen imagery from a small reusable pattern set.

Terrain labels do not automatically implement behavior. For example, terrain 2
could mean water in your game; another game could use it for ladders.

```python
ground = tile_terrain(board, player_x, player_y)
if ground == 2:
    move_delay = 10
else:
    move_delay = 5

next_x = player_x + 1
if not tile_is_solid(board, next_x, player_y):
    player_x = next_x
```

`solid` and `terrain` are independent. Water can be walkable; a wall can be solid.
Games handle any damage, speed changes, interactions, and object collisions.

## Static layouts and queries

`tilemap(source)` requires a top-level assignment; for a manual layout, `source`
is a literal nested list, as in `tilemap(source=[[brick, floor]])`.
Every cell must name a previously declared `tile()`; qualified module names,
such as `art.brick`, are supported. Rows must be nonempty, have equal lengths,
and fit within 32x32 tiles. Flat lists, expressions as cells, inline `tile()`
calls, and references to ordinary integer arrays are not accepted.

The nested list is consumed during compilation. It does not create a mutable
nested array or execute drawing loops in the ROM. Maps and tile properties
are immutable; assigning another handle to a variable does not modify a map.
Cell names must refer directly to tile declarations rather than runtime aliases.

| Query | Nested-map result |
| --- | --- |
| `tile_at(map, x, y)` | Shared graphical tile ID, or -1 outside the map |
| `tile_is_solid(map, x, y)` | 1 for solid cells, 0 for walkable cells; outside returns 1 |
| `tile_terrain(map, x, y)` | Terrain label 0..255, or -1 outside the map |
| `map_width(map)` / `map_height(map)` | Dimensions in tiles |

Invalid or wrong-kind handles return -1 for dimensions, tile IDs, and terrain,
and 1 for solidity. `tile_terrain` accepts nested graphical maps; BMP-only maps
and separate `collision_map` handles have no terrain labels and return -1.
Queries read the original map, not the current screen contents.

Coordinates are relative to the map, regardless of its drawing position.
For Star Chase's board drawn at `(0, 3)`, subtract 3 from screen tile Y before
querying. Negative map coordinates do not wrap. See [collision](collision.md)
for larger objects and pixel-to-tile conversion.

## Palettes and storage

Each source tile imports a background palette into slots 1..7. Different tiles
in one map keep their own palette; slot 0 remains available for text. Definitions
using the same BMP share its palette even when their properties differ. The
existing limit of seven imported background palettes applies. Palette overrides
work with `bg_palette`; color is visible on `dual`/`cgb` targets, with grayscale
fallback on original Game Boy.

Repeated graphical patterns share the global tile pool, even when their solidity
or terrain differs. Each map stores one byte per cell selecting a shared local
definition. A local definition uses three bytes: graphical tile ID, palette plus
solid flag, and terrain label. Maps also have a two-byte definition pointer and
an eight-byte asset descriptor. Each named tile or map handle uses two bytes of
WRAM; map cells and definitions reside in ROM.

For Star Chase's 20x13 board with two definitions, the layout and property table
occupy **268 bytes** (260 cells + 6 definition bytes + 2 pointer bytes), plus its
descriptor and the separately stored graphics. Solidity needs no separate map.
A single graphical tile always occupies 16 bytes before cross-asset deduplication.

Build manifests expose `maps` as shared graphical tile IDs, `cellMap` as local
definition IDs, and `definitions` as `[tile_id, flags, terrain]` triples. Flags use
bits 0..2 for the palette slot and bit 7 for solidity. These are compiler metadata;
use query routines rather than hard-coded compiled IDs in game logic.

BMP-based `tilemap("board.bmp")` and separate bit-packed `collision_map([...])`
remain available. Use them when you prefer image editing or need an independent
collision layout. `draw_map` clips to the visible 20x18 screen. Use
[scrolling worlds](scrolling.md) to load a complete map and move a pixel camera;
runtime map editing remains unsupported.

See [Star Chase](star-chase.md) for a complete example using nested maps.
