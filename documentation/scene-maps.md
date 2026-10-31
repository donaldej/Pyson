# Arena-sized backgrounds with masked characters

For multiple color groups in one arena, use `scene_map(path, hud_rows=2,
palettes=3)` with an indexed BMP. See [indexed colors](indexed-colors.md) for
the file format, monochrome behavior and palette reservations for filled actors.

`scene_map` loads one scrolling background at a time. It is useful when a game
has several arenas that will never be visible together. Changing arenas reuses
the same graphics memory; it does not keep every arena's tiles loaded.

The default HUD is two tile rows (16 pixels) tall. For a larger fixed area,
write `scene_map("arena.bmp", hud_rows=3)`. That keeps the top 24 pixels still,
which leaves room for names, health, and score. `hud_rows` accepts literal
integers 1..6; every scene in the ROM must use the same value. Masked pictures
are automatically clipped below the chosen HUD.

```python
arena = scene_map("assets/arena.bmp")
fighter = masked_sheet("assets/fighter.bmp", 32, 64)

# camera_x is a horizontal position in pixels.
draw_scene(arena, camera_x=120)
draw_masked(0, fighter, 0, world_x - 120, player_y)
refresh_screen()
```

This path requires `masked_sheet` graphics. The BMP must be 144 pixels tall,
160–1024 pixels wide, and have dimensions divisible by eight. The first two
screen rows are reserved for your HUD. Print names, health or numbers there;
they stay still while the scenery moves. Masked pictures are clipped below
that HUD automatically. Their `x` and `y` arguments remain screen pixels.
If you print text over the arena, draw it after `draw_scene` each frame while
it is needed. Drawing the scene again restores the scenery underneath old text.

`draw_scene(scene, camera_x=0)` accepts positions between zero and the image
width minus 160. Values outside that range stop at the edge. Movement has
single-pixel precision. It becomes visible on `refresh_screen()`, along with
the characters and other drawing changes.

Loading a different scene briefly stops the display to replace its tile
patterns and background palette 0. You may call `bg_palette(0, ...)` after
loading it to choose your own colors. Use scene changes between scenes,
rather than switching scenes every animation
frame. Moving the camera within the current scene keeps the display running.
After `clear_screen()` or an exclusive `show_image()`, draw the scene again.

Each current scene shares 128 resident tile slots with the font and other
ordinary tiles. All four masked layers share a separate limit of 128 composed
cells. The compiler checks each arena separately against the resident limit.
It reports an error instead of removing detail to fit. Repeated tile patterns
within an arena are stored once. Scenery underneath a masked character comes
from the current arena, including its opaque black and white pixels.

The feature adds no setup dependency. Developers can run `npm run test:scenes`
for compiler checks and optional PyBoy pixel checks. Those emulator checks skip
when the optional emulator environment is absent.

To leave more room for scenery, runtime error messages and source-file labels
use uppercase in scene-map programs. Text you explicitly print retains its
original case. Performance still depends on the size of the masked pictures;
use elapsed frame time for game logic, as described in [frame timing](frame-timing.md).
