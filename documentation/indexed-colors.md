# More colors in pictures and arenas

The Game Boy Color can give each 8Ã—8 background tile its own group of four
colors. This lets a picture have blue sky, warm stone and green plants together.
The original Game Boy still displays four shades.

```python
title = screen_image("assets/title.bmp", palettes=8)
credits = scroll_image("assets/credits.bmp", palettes=8)
arena = scene_map("assets/arena.bmp", hud_rows=3, palettes=3)
```

These are still ordinary BMP imports. Building does not need an extra tool.
Leaving out `palettes` keeps the existing single-palette conversion.

## Preparing the BMP

Use an indexed BMP: an image whose pixels refer to entries in a color table.
The editor must preserve that table's order when saving. A 4-bit or 8-bit
indexed BMP is suitable; a 24-bit RGB BMP does not preserve palette groups.

Put colors into consecutive groups of four:

| Color-table entries | Palette group |
| --- | --- |
| 0â€“3 | 0 |
| 4â€“7 | 1 |
| 8â€“11 | 2 |
| 12â€“15 | 3 |
| 16â€“31 | Groups 4â€“7 |

Turn on an 8Ã—8 grid in the editor. Each tile must use colors from just one
group. Adjacent tiles can use different groups. Pyson checks this and tells you
the tile coordinates if a tile mixes groups. It also reports groups outside the
declared count. It does not silently reduce or rearrange these colors.

`screen_image` and `scroll_image` accept 1â€“8 palettes. `scene_map` accepts 1â€“4.
Use `palettes=1`, or omit it, for the ordinary RGB BMP conversion. The ordered
indexed import is used with counts greater than one. Counts are literal numbers.

Repeated tile patterns share graphics memory even if their palette groups
differ. Adding color alone does not require another copy of the same pattern.
Existing tile limits, image dimensions and arena HUD rules still apply.

In a program using indexed imports, loading a picture or a different arena
replaces all eight background palette slots. Set any custom HUD palette after
`draw_scene()`. Filled character palettes are restored automatically. Leaving
an exclusive picture restores the palette table that was active before it.

## Original Game Boy behavior

Keep the same shade order in every group. For example, make each group's first
color its darkest and its fourth its brightest. Pyson derives the monochrome
shade mapping from group 0, then applies that mapping to every group. It cannot
display different monochrome mappings for individual background tiles.

The compiler keeps the lower two bits of each indexed pixel as its shade
number. This makes it possible to color existing artwork without changing its
shapes or dithering. Choose four clearly separated brightness levels in group 0; nearby brightness values can round to the same monochrome shade. Test on both DMG and CGB when choosing the palettes.

## Colored masked characters

```python
sprite_palette(0, "#070D19", "#583C46", "#D98966", "#FFF0D8")
masked_palette(0, 0, fill_tiles=True)
```

`fill_tiles=True` colors fully opaque tiles directly. Edge tiles keep their
exact scenery and use sprite overlays. Transparent pixels remain transparent.
Give scenery palettes and fighter palettes the same color 0 for consistent
opaque outlines along those mixed edges.

This mode reserves background palette slots **4â€“7**, mirroring sprite palettes
**0â€“3**. Keep scenery and interface palettes in slots 0â€“3. Use palette indices
0â€“3 for filled masked layers. Clearing the screen removes layer assignments;
set them again for the next scene. The default `fill_tiles=False` retains the
existing overlay-only behavior.

It uses private CGB work-RAM banks 2 and 3. Bank 3 holds a 576-byte stationary
attribute shadow and, with indexed images, a 64-byte saved palette. The runtime
restores the program's bank and stack before returning. Original Game Boys keep
their normal four-shade renderer. No save RAM or new setup dependency is added.

Filling tiles frees hardware sprites for edges, but it does not remove the
40-component total or ten-per-band overlay limits. Very large or crowded poses
can still retain scenery-colored body pixels when overlays run out. The body
and transparency stay intact. See [masked graphics](masked-graphics.md).


The private bank-3 attribute copy uses its own temporary interrupt stack. Audio, input sampling and the fixed HUD's scroll interrupt can keep running while those attributes are copied. The caller's stack, work-RAM bank, interrupt-enable mask and interrupt-master state are restored/preserved. This is runtime bookkeeping; game code needs no extra calls.
