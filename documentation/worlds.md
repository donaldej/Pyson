# Streaming worlds

`worldmap()` defines a static world larger than the hardware background map.
Use the same camera, collision, animation and window routines as ordinary maps.

```python
header.target = "dual"
board = worldmap("assets/world.bmp")
hero = sprite_sheet("assets/hero.bmp", 8, 8)
draw_world(board)
while True:
    wait_vblank()
    set_camera(player_x - 76, player_y - 68)
    world_sprite(0, hero, 0, player_x, player_y)
    refresh_screen()
```

The BMP must have dimensions divisible by eight and at most 1,024 pixels along
each axis (128x128 tiles). It follows the existing four-color BMP palette rules.
Repeated graphics share a world tile ID. Unlike ordinary `tilemap()` assets,
the complete world can contain more than 256 unique tiles.

For collision, supply literal rows matching the image's tile grid. `#` marks
solid cells and `.` marks walkable cells; omitted collision means all cells are
walkable. The small example below requires a 32x24-pixel BMP:

```python
board = worldmap("assets/room.bmp", collision=[
    "####",
    "#..#",
    "####",
])
```

Alternatively, use a rectangular nested list of previously declared `tile()`
assets. These retain their palettes, solidity and terrain properties:

```python
wall = tile("assets/wall.bmp", solid=True, terrain=1)
floor = tile("assets/floor.bmp", terrain=2)
board = worldmap([[wall, wall, wall], [wall, floor, wall]])
```

Declarations are compile-time data; they do not allocate runtime arrays.
Tiles used exclusively in streamed worlds do not occupy permanent graphics
slots. Fonts, sprites and ordinary maps remain resident.

## Coordinates and queries

`set_camera()` and `camera_x()` / `camera_y()` support full 16-bit coordinates.
The maximum camera position is `max(0, width * 8 - 160)` horizontally and
`max(0, height * 8 - 144)` vertically. `world_sprite()` and
`world_animated_sprite()` subtract this full camera position.

`map_width()`, `map_height()`, `tile_at()`, `tile_is_solid()` and `tile_terrain()`
work anywhere in the world, including regions currently absent from VRAM.
Queries use tile coordinates. `tile_at()` returns a stable ID local to that
world, which can exceed 255; it does not return a temporary VRAM slot.
BMP worlds return terrain zero. Out-of-bounds behavior matches ordinary maps:
tile/terrain queries return -1 and solidity returns true.

## Loading and limits

The compiler prepares overlapping 26x24 working windows at four-tile (32-pixel)
intervals inside the 32x32 hardware map. A one-tile leading margin keeps the
previous viewport covered when moving into a neighboring region. Identical
graphics/layout blobs are deduplicated and packed into ROM banks.

World tiles receive fixed VRAM slots from a conflict graph: different graphics
needed by neighboring windows must use different slots, while distant graphics
can reuse them. This prevents incoming graphics from overwriting visible tiles.
Compilation rejects worlds whose windows exceed the resident tile budget or
whose neighboring regions cannot be assigned slots within that budget. The
compiler uses a conservative greedy assignment; reducing local variety or
resident assets can help a layout that does not fit. A 32x32 collision chunk
also permits at most 256 distinct combinations of tile ID, palette, solidity
and terrain.

`refresh_screen()` automatically preloads the neighboring region in the current
camera movement direction. Upload state persists between calls, so movement,
animation, input and sound continue while loading. No extra Pyson routine is
required: call `set_camera()` and `refresh_screen()` in the usual game loop.

Each refresh examines at most 32 graphics records, uploads at most four missing
tiles, and processes at most 64 incoming map cells. A slot cache skips graphics
already in VRAM; overlapping rows/columns are skipped entirely. Short writes
use STAT guards during HBlank or VBlank, without waiting for another frame.
Visible cells retain their graphics throughout loading. VRAM access follows the hardware
[access timing rules](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Accessing_VRAM_and_OAM.md).

Initial world loads and larger camera jumps still use an LCD-off full load;
these can briefly blank the screen. In the demo, walking uses the live path
while A deliberately jumps between distant zones. Changes of more than eight
requested camera pixels per axis per update use that full-load path. Smaller
changes use cooperative prefetch; stopping or reversing direction can leave a
completed neighbor cached or replace unfinished work with the newly needed
neighbor.

The camera only advances into a completed region. If movement outruns the
upload budget, it temporarily stays within the loaded window while gameplay
continues. Loading is therefore bounded work, not a promise of arbitrary camera
speed at a fixed frame rate. The demo is tested at two pixels per update on DMG
and CGB, with and without the window HUD, checking movement gaps, camera lag,
visible tile contents, and safe writes.

Streaming reserves two WRAM bytes per available graphics slot for tile IDs,
plus 29 bytes of prefetch bookkeeping beyond the previous region loader. The
slot count is `256 - resident_tile_count`; fonts, sprites and ordinary maps
contribute to resident tiles. Include this cost when budgeting variables and
arrays alongside the graphics/window buffers.

Precompiled overlapping windows trade ROM space for simple, bounded loading.
Identical rows share a bank-local row dictionary. Each unique tile bitmap is
stored once, with region graphics lists referencing its ROM address and bank;
repeated lists and complete layouts also share storage. Cartridge size/controller selection remains automatic
unless explicitly configured. World dimensions and working-window tile limits
still apply even with a larger cartridge.

Use the fixed [window HUD](window.md) for overlays. Background text or drawing
can be overwritten as incoming world cells stream, and bulk background edits
retain their existing upload costs. `clear_screen()` leaves the
world and resets the camera; `draw_world()` selects it again. Repeating
`draw_world()` for the currently active world preserves its camera.

## Demo

```powershell
npm.cmd run build -- examples/streaming-world/main.pysn streaming-world
```

Open `binary/streaming-world.gb`. The D-pad moves; A jumps to the next of sixteen
zones. The 1,024x1,024 world contains 384 distinct graphics, an animated player,
border collision and a fixed coordinate HUD. All required files are included.
Edit its BMP files in a bitmap editor and its collision rows in `world.pysn`.
