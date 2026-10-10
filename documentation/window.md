
# Fixed HUD and window text

For automatic wrapping, typewriter text, and page navigation, use
[dialogue](dialogue.md).

The Game Boy window layer displays text at a fixed screen position while the
background camera scrolls. Use it for status bars, inventory panels, dialogue,
or full-screen menus. Both DMG and Game Boy Color are supported.

```python
header.target = "dual"
bg_palette(4, "#203850", "#486880", "#a0c0e0", "#ffffff")
clear_window(4)
window_position(0, 136)  # Bottom eight pixels: one tile row.
print_window("HP: 3", 0, 0, 4)
show_window()
refresh_screen()
```

The window starts hidden at position `(0, 0)`. Printing or clearing its contents
does not show it; call `show_window()` explicitly.

## Routines

| Call | Behavior |
| --- | --- |
| `window_position(x, y)` | Queue the window's top-left position in screen pixels: X 0..159, Y 0..143. The runtime handles the hardware's seven-pixel X offset. |
| `show_window()` | Queue showing the window at its current position. |
| `hide_window()` | Queue hiding the window; preserve its contents and position. |
| `clear_window(palette=0)` | Fill the window text buffer with blank tiles using background palette 0..7. Preserve visibility, position, background, and camera. |
| `print_window(value, x, y, palette=0)` | Print a string or signed integer at window-local tile coordinates, X 0..19 and Y 0..17. |

Fixed parameters accept positional or [named arguments](arguments.md). Text behavior matches [print](print.md): the same
font, integer formatting, newline handling, and clipping. Coordinates are
relative to the window's origin, so `(0, 0)` is its first character even when
the window is moved. Printing shorter text leaves the remaining old characters;
clear the field or print spaces when its length may decrease.

Literal coordinates or palette indices outside their allowed range are compile
errors. Invalid dynamic values draw nothing or leave position unchanged. Palette
indices select the existing background palettes shared with text and maps; use
`bg_palette()` to configure their colors. Color 0 fills blank areas and color 3
draws letters. Custom color is available on `dual`/`cgb` targets with grayscale
fallback on original Game Boy.

## Window geometry

The window covers the screen from its X/Y origin towards the right and bottom
edges. It is opaque and has no height parameter or transparent blank cells.

- `(0, 136)` shows one bottom row.
- `(0, 128)` shows two bottom rows.
- `(0, 80)` provides a bottom dialogue panel.
- `(0, 0)` covers the screen for a menu.

Positions need not be tile-aligned. Contents outside the visible screen are
clipped. An eight-pixel HUD at the top would require a mid-frame raster split to
stop the window; that is not implemented in this version. Use a bottom panel
for a small fixed HUD. Hardware sprites retain their existing behavior and may
overlap window graphics; keep them out of the panel when that matters.

## Camera and screen transitions

The window ignores `set_camera()`, `camera_x()`, and `camera_y()`. World collision
and terrain queries remain unchanged. Window operations do not modify the
selected world or its camera.

```python
draw_world(board)
window_position(0, 136)
show_window()
while True:
    wait_vblank()
    set_camera(player_x - 76, player_y - 68)
    world_sprite(0, hero, 0, player_x, player_y)
    print_window(player_x, 2, 0)
    refresh_screen()
```

`clear_screen()` resets the background and camera but **preserves the window**.
Call `hide_window()` when switching to a title or result screen if the HUD should
not remain visible. Call `clear_window()` to reset its text independently.
Window operations are buffered; `refresh_screen()` displays their changes.
Programs reaching their end refresh once automatically. Runtime error messages
hide the window so it cannot cover the diagnostic background text.

## Rendering and storage

The hardware has two tile-map regions. Programs using window routines reserve
`$9800` for the background and `$9C00` for the window. Programs without window
routines keep the existing background double-buffering renderer.

HUD programs use an independent 20x18 text buffer: 360 tile bytes, 360 attribute
bytes, 18 dirty-row bytes, and nine bytes of window state. This storage is only
allocated when window routines are compiled. Background and window tiles still
share the existing font/tile pool and background palettes. Variables and arrays
must fit the remaining WRAM; there is no heap or automatic reuse.

An unchanged window cell does not dirty its row. A single changed HUD row can
be uploaded with camera and sprite changes during one fresh VBlank when no
palette upload is pending. Larger window updates are processed over multiple
VBlanks; several changed rows are not an atomic panel replacement. A palette
upload may also add a wait. For initial panel setup, prepare contents while the
window is hidden and show it after refresh if intermediate rows matter.

With a window there is no spare map for hidden background preparation. Bulk
background edits pause the LCD at VBlank, upload the changed background/window
rows, and resume the display. A world or screen transition can therefore produce
a brief blank interval. Normal camera movement and a one-row HUD update do not
pause the LCD. Redraw static labels only when necessary and update changing
fields when their values change, as the demo does.

## Demo

The [scrolling-world example](../examples/scrolling-world/main.pysn) now shows
player X/Y and `FLOOR`/`WATER` in a fixed bottom status bar. It hides the bar on
the result screen and recreates it on replay.

```powershell
npm.cmd run build -- examples/scrolling-world/main.pysn scrolling-world
```

Open `binary/scrolling-world.gb` in an emulator. A/Start starts or restarts;
the D-pad moves.
