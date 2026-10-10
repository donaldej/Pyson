# Mutable terrain

`mutable_map(rows)` declares a RAM-backed map using the same nested tile rows
as `tilemap()`. Dimensions must fit 32×32 tiles; declarations are top-level.
Each cell stores a graphics tile ID, palette/solid flags, and terrain label.
It costs three WRAM bytes per cell, plus a two-byte handle. Large maps can exceed
the available 4 KB WRAM after graphics buffers and other game state are included.

```python
wall = tile("assets/brick.bmp", solid=True, terrain=1)
floor = tile("assets/floor.bmp", terrain=0)
board = mutable_map([[wall, wall, wall], [wall, floor, wall]])
set_map_tile(board, 2, 1, floor)
draw_map(board, 0, 3)
```

`set_map_tile(map, x, y, tile)` returns 1 on success or 0 for invalid
coordinates, a wrong-kind map, or a non-tile replacement handle. A replacement
must be a declared `tile()` asset. Solidity and terrain change with its artwork.
`reset_map(map)` returns 1 after restoring that map's original cells, otherwise 0.
Neither operation changes immutable maps or streamed worlds.

Existing `tile_at`, `tile_terrain`, `tile_is_solid`, `rect_is_solid`, and movement
helpers read the current cells immediately. Drawing is explicit: call `draw_map`
after an edit to queue its new appearance, then `refresh_screen`. For a selected
mutable world, `draw_world` redraws its cells while retaining the camera. Redraw
only when necessary; redrawing a whole map requires CPU work even when few tiles
changed. Replacing cells does not automatically push actors out of new walls.

Each declaration has independent cell storage. Copying or importing its numeric
handle shares that same map. Clearing the screen does not reset its cells.
The original cell triples are stored in ROM for reset; BMP graphics retain their
existing global deduplication. Mutable maps currently require nested tile rows;
there is no mutable BMP/worldmap declaration or automatic save integration.
Declared replacement tiles remain resident in VRAM when mutable maps are used,
including tiles also used by a streamed world. The existing resident-tile and
streaming-window budgets still apply.

The [Feature Lab](../examples/feature-lab/main.pysn) opens a door with A and resets
the board with B. It avoids closing the door while the player occupies it.
