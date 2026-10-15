# 2. Sprites, palettes, and animation

Goal: understand how an image becomes reusable sprite frames, then let the
runtime advance an animation instead of selecting every frame yourself.

## Step 1: move a sprite

Build [Color Sprites](../examples/color-sprites.pysn):

```powershell
npm.cmd run build -- examples/color-sprites.pysn color-sprites
```

Use the D-pad to move and A to change colors. Open the source and locate:

```python
hero = sprite_sheet("assets/hero.bmp", width=16, height=16)
```

Compilation converts the BMP into hardware tiles, frames, and a palette.
The image must contain whole 16x16 frames. `sprite(0, hero, 0, x, y)` selects
frame 0 and draws its top-left corner at screen pixel coordinates `(x, y)`.
This is different from `print`, whose coordinates are tiles. The example also
uses `sprite(0, hero, frame, x=x, y=y, flip_x=flipped)`: parameter labels make
the coordinates and optional flip easier to identify. Positional calls still work.
See [readable calls](09-readable-calls.md) for a guided explanation.

A 16x16 sprite uses four consecutive hardware slots. Another such sprite should
start at slot 4, not slot 1. The hardware allows 40 slots total and ten 8x8
components on one scanline. Increasing actor count can therefore hide sprites
even before exhausting RAM.

## Step 2: understand color and transparency

Each sprite has three opaque colors plus transparent color 0. For a BMP without
meaningful alpha, its top-left color is the transparency key. That color is
transparent everywhere in the sheet, not just in the corner.

`sprite_palette(index, color0, color1, color2, color3)` changes a palette slot. RGB colors are
quantized to Game Boy Color precision. On monochrome hardware, custom RGB colors
do not produce color. Use a Color emulator mode to inspect palette changes.
Different BMP files can consume separate palette slots, even with equal colors.

## Step 3: delegate animation playback

Build [Animation Gallery](../examples/animation-gallery/main.pysn):

```powershell
npm.cmd run build -- examples/animation-gallery/main.pysn animation-gallery
```

Find the definition and playback calls:

```python
walk = sprite_animation(hero, [[0, 8], [1, 8]])
play_animation(0, walk)
update_animations()
```

Each pair means `[sprite_frame, duration_ticks]`. Playback state belongs to a
slot; the definition is reusable. `animated_sprite(0, x, y)` draws the current
frame. `update_animations()` advances one animation tick per call, not magically
once per hardware frame. Lesson 7 shows elapsed-time animation.

Try A for walking, B for idle, Start for a one-shot, and Right to pause animation.
Read the on-screen controls for the other actions.

## Try it

For a complete example of reserving sprite slots, see
[Star Squadron](../examples/star-squadron/README.md). Its automatic space battle
uses all 40 components: a 16x16 player, four 16x16 enemies, twelve bullets,
and eight sparks. The README shows the slot ranges. Read `visuals.pysn` to see
how separate enemy rows and spaced bullets avoid the ten-components-per-scanline
limit. Background stars and the fixed HUD use no sprite slots.

In a copied gallery, change both walk durations from 8 to 16. That walk should
animate more slowly without changing the artwork. Next compare the independent
players: pausing or restarting one playback slot need not redefine its shared
animation data.

References: [BMP conversion](../documentation/assets.md),
[graphics](../documentation/graphics.md), [animation](../documentation/animation.md).

[Previous](01-first-program.md) · [Next: screens and modules](03-screens-modules.md)
