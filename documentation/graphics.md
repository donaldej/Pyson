# Graphics and color

Drawing updates buffers. Without window routines, `refresh_screen()` prepares
the hidden background map, then commits the display, palettes, and sprites at
VBlank. Programs using a [fixed window HUD](window.md) reserve one hardware map
for the window and use the renderer described there. Large background changes
may take several frames to prepare. A program reaching its end refreshes once;
ongoing game loops must call `refresh_screen()` explicitly.

Use `header.target = "dual"` for color with original Game Boy compatibility,
or `"cgb"` for Color only. A `"dmg"` target uses monochrome even on Color hardware.
Monochrome fallback uses fixed grayscale mapping; custom RGB colors are ignored.

Use [sprite animation helpers](animation.md) to define frame sequences and
timing, then draw their current frames with `animated_sprite()` or
`world_animated_sprite()`.
For a changing background illustration or cutscene, use
[background clips](background-clips.md). They keep frame artwork in ROM and
reuse two VRAM buffers instead of keeping every frame resident.

## Routines

Fixed parameters accept positional or [named arguments](arguments.md). Defaults
below apply when optional parameters are omitted.

| Call | Behavior |
| --- | --- |
| `refresh_screen()` | Display queued drawing; does not sample input |
| `clear_screen(palette=0)` | Clear background to blank tiles using palette 0..7; keeps sprites |
| `print(value, x, y, palette=0)` | Draw text at tile coordinates using background palette 0..7 |
| `bg_palette(index, color0, color1, color2, color3)` | Set one background palette |
| `sprite_palette(index, color0, color1, color2, color3)` | Set one sprite palette; color 0 is transparent |
| `sprite(slot, sheet, frame, x, y, flip_x=False, flip_y=False)` | Draw a sprite frame with top-left pixel coordinates |
| `hide_sprite(slot)` | Hide the complete frame previously drawn at this base slot |
| `draw_map(map, x, y)` | Draw an imported background map at tile coordinates |
| `print_window(value, x, y, palette=0)` | Print fixed window text at window-local tile coordinates |
| `window_position(x, y)` | Position the window in screen pixels |
| `show_window()` / `hide_window()` | Show or hide the fixed window layer |
| `clear_window(palette=0)` | Clear window text independently of background and camera |
| `draw_world(map)` | Load a full background map for scrolling |
| `set_camera(x, y)` | Queue a clamped world camera position in pixels |
| `camera_x()` / `camera_y()` | Read the queued camera position |
| `world_sprite(slot, sheet, frame, x, y, flip_x=False, flip_y=False)` | Draw a sprite at world pixel coordinates |

Use [tile queries and collision](collision.md) for `tile_at`, `map_width`,
`map_height`, `tile_terrain`, and static wall maps checked with `tile_is_solid`.
[Nested tile maps](tilemaps.md) combine reusable BMP tiles, palettes, and properties.

Palette indices for palette setters must be literals 0..7. Colors must be
literal `"#RRGGBB"` strings or RGB15 integers 0..32767 (red bits 0..4, green
5..9, blue 10..14). Initial palettes are grayscale; imports supply their own
palettes. Text uses color 0 as its background and color 3 for letters.

```python
header.target = "dual"
bg_palette(0, "#102040", "#6080a0", "#a0c0e0", "#ffffff")
print("Hello in color!", 1, 1)
refresh_screen()
```

## Sprites and maps

Import with `hero = sprite_sheet("hero.bmp", 16, 16)` or
`level = tilemap("level.bmp")`. See [BMP assets](assets.md) for image requirements.
Frames are numbered from 0. Coordinates and frame selection can be expressions.
Sprites clip at screen edges; flipping applies to the entire frame.

The hardware provides 40 sprite slots, numbered 0..39, and can display at most
10 components on one scanline. Each 8x8 component uses one slot: a 16x16 frame
uses four consecutive slots. Reserve distinct ranges yourself, for example
base slots 0 and 4 for two such characters. Overlapping slot ranges overwrite
each other. Invalid dynamic asset IDs, frames, or slot capacity draw nothing.

Background coordinates use tiles, x=0..19 and y=0..17. Maps clip at the right
and bottom screen edges. Invalid dynamic starting coordinates draw nothing;
invalid literal coordinates are compile errors. Use [scrolling worlds](scrolling.md)
for full-map loading, a pixel camera, and world-coordinate sprites.

```python
hero = sprite_sheet("assets/hero.bmp", 16, 16)
x = 40
while True:
    wait_vblank()
    if button("right"):
        x += 1
    sprite(0, hero, 0, x, 60)
    refresh_screen()
```

`wait_vblank()` samples input and waits for a fresh frame; it does not refresh the screen.
`refresh_screen()` also waits for VBlank, so using both may consume additional frames.
See the complete [color demo](../examples/color-sprites.pysn): D-pad moves the
animated character and A changes its palette.
