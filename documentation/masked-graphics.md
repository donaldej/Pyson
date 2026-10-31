# Masked graphics: four visible shades and transparency

When ordered input history is used, masked programs reserve 133 bytes for it.
Repeated button states are stored as runs, while `next_input_frame()` still
returns one frame at a time. This costs 64 bytes more than the ordinary input
queue and preserves commands across slow redraws. See [input](input.md).

For multiple arenas or a scrolling stage with these characters, see
[scene maps](scene-maps.md). Ordinary `set_camera`/`worldmap` scrolling remains
incompatible with masked composition; `draw_scene` provides its own camera.

Ordinary Game Boy sprites have three visible colors. Their fourth color means
"show the background here." That is ideal for most games. It cannot reproduce
artwork that needs **four visible shades and transparent holes** at the same time.

A masked sheet keeps the transparent holes separate from the visible colors.
Pyson combines the artwork with the scenery before displaying the picture.
This is useful for large characters with detailed outlines. Ordinary sprites
remain the simpler, faster choice when three visible colors are enough.

## Drawing a character

```python
fighter = masked_sheet("assets/fighter.bmp", 72, 104)

clear_screen()
draw_masked(0, fighter, 0, 20, 16)
refresh_screen()
```

The BMP must use 32-bit pixels with an alpha channel. Alpha below 128 is
transparent. Alpha 128 or greater is visible. The entire sheet may contain up
to four opaque RGB colors. Pyson rejects extra colors instead of silently
changing your artwork. At least one pixel in the sheet must have nonzero alpha.

Width and height describe one animation frame. Width must be a multiple of
8; each dimension must be between 8 and 128. The frame size must divide the
sheet size exactly. Frames are numbered from zero, across each row, then down.
There may be up to 255 frames. The four visible shades are ordered from light
to dark. All sheets should use the same four shades when they share a scene.

`draw_masked(slot, sheet, frame, x, y, flip_x=False, clip_top=0)` places the top-left corner
of the frame at a pixel position. Use slots 0 through 3. Higher-numbered slots
appear in front of lower ones. A layer keeps its position until you draw it again
or call
`hide_masked(slot)`. Drawing order is determined by slot, not call order.
Negative coordinates and partially offscreen artwork are clipped. Invalid
handles, frames or slots leave the previous layer unchanged.

To keep a jumping character behind a top status bar, pass `clip_top=16` for a
two-row bar. Pixels above screen row 16 are hidden; the picture keeps moving
normally instead of being pushed down. Each slot remembers its own setting.
The default, 0, uses the whole screen. Values 0 through 144 are valid; 144 hides
all pixels in that layer. An invalid value leaves the previous layer unchanged.

```python
draw_masked(0, fighter, jump_frame, player_x, player_y, clip_top=16)
```

Call `refresh_screen()` after preparing the frame. Pyson prepares changed
patterns away from the visible picture, then switches the picture during
VBlank. Both layers appear together. It does not stop the display to animate.
`clear_screen()` removes all four layers and resets their scenery.

## Scenery and color

Use normal `draw_map` and `print` calls for the stationary scenery and text.
Changes to the scenery are remembered beneath the characters; hiding or moving
a character restores what was there. A masked character inherits the background
palette of each tile it covers. It does not yet have its own independent color
palette. This preserves all four shades without introducing colored rectangles
around its outline. Optional CGB color accents are described below.

### Independent colors on Game Boy Color

Use an ordinary sprite palette, then assign it to a masked layer:

```python
sprite_palette(0, "#081828", "#703848", "#C85870", "#FFD8C0")
masked_palette(slot=0, index=0)
draw_masked(0, fighter, 0, 20, 24)
refresh_screen()
```

`masked_palette(slot, index=-1, fill_tiles=False)` remembers the palette for that layer. The
default `-1` turns its accents off. `clear_screen()` removes the assignment,
so set it again when preparing a new scene. `hide_masked()` hides its accents
with the body. Invalid slots or indices leave the existing assignment alone.

The layer's visible color numbers 1, 2 and 3 use the selected sprite palette.
Color number 0 stays in the composed background image. For a dark outline,
make background color 0 your dark color. Transparent pixels remain transparent,
including when two layers overlap. This is color highlighting of a four-shade
picture, rather than unrestricted per-pixel RGB artwork.

The original Game Boy automatically displays the original four-shade image.
You can use `is_cgb()` to select different labels or effects, but it is not
necessary to make this fallback work. The small
[masked-colors example](../examples/masked-colors/main.pysn) demonstrates both
modes and lets you turn accents on/off with A.

The accents share the Game Boy's 40 hardware sprite components. Pyson uses
8x16 components and limits each aligned 16-pixel band to ten. Higher masked
slots get priority. Large or crowded poses may exhaust that budget; those
parts keep their original shades instead of losing body pixels. This makes
the fallback safe, but it does not guarantee full accent coverage in every
pose. This mode reserves the sprite layer, so use masked layers for projectiles
instead of combining it with `sprite_sheet` or `actor_sheet`.

To free overlay components, opt into `fill_tiles=True`. Opaque cells use
background palettes directly; mixed scenery edges retain overlays.
This reserves BG palettes4–7, mirroring OBJ0–3, and private WRAM bank3 in
addition to bank2. See [indexed colors](indexed-colors.md) for an example and
the outline-color recommendation. Hardware overlay limits still apply.

Color accents use another 4 KB of temporary cartridge RAM for ownership
masks, plus CGB work-RAM bank 2 for private staging and a temporary renderer
stack. Pyson restores the program's normal memory bank and stack before source
execution resumes. The build report identifies these extra resources. No new
tool or setup step is required, and ordinary masked programs keep the existing
renderer and memory use unless they call `masked_palette`.

Exclusive `screen_image` opening screens can be displayed between scenes;
`clear_screen()` restores normal drawing. Windows, camera scrolling, streamed
worlds, `actor_sheet`, and `background_clip` cannot share this renderer yet.
Without color accents, ordinary sprite sheets can coexist, for example for
small projectiles. Calling `masked_palette` reserves that sprite layer for
the accents; use another masked layer for projectiles in that case.

## Costs and current limits

This mode uses an MBC5 cartridge. Without `masked_palette`, Pyson selects
8 KB of cartridge RAM. With color accents, it selects **32 KB** automatically
so repeated color patterns can be cached. An explicit `header.ram_kb = 8`
keeps the uncached color path available; your drawing calls stay the same.
**4 KB** is used as temporary graphics memory: 2 KB for composed patterns and
2 KB for a cache of stationary patterns. The cache avoids repeatedly switching
ROM banks while combining characters with the background. It is not saved data.
Battery-backed cartridges and Pyson save routines are currently rejected for
this mode so graphics cannot overwrite persistent saves. Other Pyson programs
keep their existing save support.

The color cache uses the additional three 8 KB cartridge-RAM banks. Each
masked layer remembers three compositions. A match includes the exact actor
frames, positions, clipping, overlapping actors in front, palette slot indices,
and the sprite budget already used. Cached sprite coordinates are rebased for
the current hidden pattern pool. Pyson tracks both pools separately and only
uploads patterns that are missing from the target pool. Screen resets invalidate
the cache. Palette RGB changes can take effect without rebuilding the patterns.
Moving layers still look for a match, but avoid storing a new composition at
every new position. This reduces cache overhead while walking.

This is an automatic optimization, not a promise that every scene gets faster.
New frames, movement, overlap changes and crowded poses can still require full
composition. The 40-sprite total and ten-per-band accent limits still apply.
No extra dependency or source-language feature is required. The build report
shows whether the color cache is enabled and its cartridge-RAM allocation.

The font, stationary maps and ordinary sprite patterns share 128 resident
patterns. All four masked layers together can touch up to 128 screen tiles per
frame. There are two hidden/displayed pattern pools. If the dynamic budget is
exceeded, Pyson retains the displayed picture; `wMaskedOverflow` in emulator
symbols identifies the failure. Simplify the artwork or reduce its displayed
area. There is no automatic conversion to a lossy three-color sprite.

The base masked image consumes no hardware sprites and therefore does not
encounter the 10-sprites-per-scanline limit. Optional color accents do use
hardware sprites and have the coverage limits explained above. Both drawing
and coloring cost CPU time and ROM space. Pyson
prepares horizontal alignments and mirrored artwork during compilation so the
Game Boy does less work each frame. Transparent row margins are omitted.
On Game Boy Color, hidden patterns are uploaded with HBlank DMA. Original
Game Boy hardware uses the CPU transfer path. Both paths finish before the
new picture is displayed. Changing large layers can take several display
frames, especially on DMG.
Repeated encoded scanlines within a prepared frame share their ROM data.
Identical complete prepared variants also share their data and pointers. This
can avoid a redraw when two animation entries contain the same picture.
This happens during compilation, including mirrored and shifted variants;
it does not change your drawing code or add work to the runtime decoder.
This API does not promise 60-frame-per-second animation. Use `frame_count()`
and elapsed time for simulation, and measure the result in an emulator.

Large masked-graphics programs can also use another 1 KB of working RAM for
variables. Pyson assigns this space automatically when the declared variables
exceed 1 KB; your assignments, arrays, and function calls stay the same.
This gives those programs 5 KB for variables and runtime buffers, with 3 KB
reserved for the CPU stack. The extra space stays in work-RAM bank 1 on Color
hardware and uses the same addresses on the original Game Boy. It does not use
saved-game memory or reuse variables that happen to have the same name.
Smaller masked programs and other renderers retain the existing 4 KB state /
4 KB stack layout. The build report shows the layout actually selected.
