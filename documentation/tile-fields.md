# Drawing changing tile grids and fields

These routines draw from ordinary integer lists. They work on DMG and CGB and
do not need background clips or a special setup. Draw normally, then call
`refresh_screen()` to display the result. They change graphics, not map collision
or terrain data; use mutable maps when gameplay needs editable terrain.

## Draw a list as a grid

```python
wall = tile("assets/wall.bmp")
floor = tile("assets/floor.bmp")
cells = [wall, wall, wall, wall, floor, wall]
draw_tile_grid(cells, columns=3, x=0, y=2)
refresh_screen()
```

The first three entries form the first row; the next three form the second.
Change an entry and draw again to update the picture. This is useful for puzzle
boards, inventories, visualizers and other layouts built during play.

`draw_tile_grid(cells, columns, x=0, y=0)` takes a named integer array and a row
width of 1..32 tiles. The last row can be incomplete. Invalid tile handles or
values that refer to another asset kind are skipped, preserving those cells.
An empty list draws nothing. Coordinates count tiles from the top-left; parts
past the right or bottom screen edge are clipped.

## Draw a field from column and row values

For smooth-looking waves and bands, make a short list of values for each axis
and a list of tiles ordered by brightness or another visual property:

```python
dark = tile("assets/dark.bmp")
light = tile("assets/light.bmp")
tiles = [dark, light]
columns = [0, 1, 0, 1]
rows = [0, 1, 0]
draw_tile_field(columns, rows, tiles, x=2, y=3)
refresh_screen()
```

This produces a four-column, three-row checkerboard. At each position the
renderer adds the column value and row value, then uses the result to select a
tile, wrapping around the tile list. In Python-like notation:

```python
selected = tiles[(columns[x] + rows[y]) % len(tiles)]
```

Change the axis values over time and the whole picture changes. A wave lookup
table can make flowing interference; squared distances can make expanding rings.
The native runtime performs the repeated cell composition, avoiding a nested
Pyson loop for every screen cell. Your code still decides the values and timing.
This is an additive field, not a general pixel shader or arbitrary equation.

`draw_tile_field(columns, rows, tiles, x=0, y=0)` takes three named integer
arrays. The tile list must contain **2, 4, 8, 16, 32 or 64 entries**. They may
repeat. Invalid tile-list entries draw blank tile 0 with background palette 0.
Negative axis values wrap consistently. Empty axes draw nothing. At most 32
entries from either axis are used, with normal clipping to the visible screen.

Both routines accept named arguments and support integer RAM arrays, read-only
ROM tables, and array parameters in helpers. A normal list is convenient when
its entries are named tile bindings. Runtime array parameters with an invalid
tile-list length draw nothing; invalid statically known lengths are compile
errors. Invalid dynamic row widths or starting coordinates also draw nothing;
invalid literals are compile errors. Starting coordinates must be x=0..19 and
y=0..17. Neither routine allocates a new framebuffer or changes its input lists.

The normal shared resident tile and palette budgets still apply. Each referenced
tile is imported with `tile()`, optionally from a shared atlas. Unlike background
clips, these routines use resident patterns rather than uploading new patterns
for every frame. Input sampling, animation and frame pacing remain explicit.

## Performance and example

[Phase Heart](../examples/phase-heart/README.md) is an original live-field demo.
Its moving backgrounds are calculated during playback; it contains static tiles,
numeric tables and music, with no animation frame sheets.

A simple 20x16 benchmark measured approximately 12 updates/second on DMG and 20
on double-speed CGB, compared with roughly 4 and 7 for a full nested Pyson loop.
Those are measurements of that small benchmark, not guaranteed rates. The full
demo adds music, helper calls, transitions and sprite geometry and runs slower.
Use elapsed frames to keep the timeline consistent when updates take longer.
