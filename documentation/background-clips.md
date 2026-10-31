# Animated backgrounds

Use a background clip for an animated illustration, title screen, cutscene or
abstract effect. It works on both original Game Boy and Game Boy Color.

```python
header.target = "dual"
intro = background_clip("assets/intro.bmp", 160, 128)

previous = frame_count()
time = 0
while True:
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    time += delta
    draw_background(intro, (time // 8) % 12, 0, 1)
    refresh_screen()
```

This example expects twelve 160x128-pixel pictures in one BMP. It requests the
next picture every eight display frames. The pictures run left to right, then
continue on the next row. `draw_background()` queues the picture;
`refresh_screen()` displays it. A complex picture can take several display
frames to prepare, so this is a timing request, not a guaranteed playback rate.
Normally remember the last picture number and redraw only when it changes.

## Preparing the image

1. Draw each frame at the same size, using at most four colors for the whole BMP.
2. Arrange frames in a rectangular grid with no gaps or borders between frames.
3. Save an uncompressed BMP and pass one frame's width and height to
   `background_clip()`. All normal Pyson BMP bit depths are supported.

Both frame dimensions must be positive multiples of eight and fit inside
160x144 pixels. The BMP must be divisible by those dimensions and no larger
than 2048 pixels on either axis. A sheet can contain 1..255 frames. Declarations
belong at module top level. Frame numbers start at zero.

## Sharing a color palette between sheets

Each clip normally gets its own background palette slot. A program can use up
to seven imported background palettes (slot 0 is reserved for text). If you
split one animation across several sheets, you can have those sheets use the
same slot:

```python
walk = background_clip("assets/walk.bmp", 160, 80)
jump = background_clip("assets/jump.bmp", 160, 96, palette=walk)
```

Declare `walk` first. Both BMPs must use the same colors in the same imported
order; the compiler checks this and reports an error if they differ. Using the
same four shades throughout the sheets is an easy way to keep them consistent.
This shares the palette only. The two clips still have their own pictures.
Changing their shared palette with `bg_palette()` changes both animations.
Leave out `palette` when you want separate palette slots.

## Drawing and placement

`draw_background(clip, frame, x=0, y=0)` accepts positional or named arguments.
`x` and `y` count eight-pixel tiles, not pixels. Parts outside the right or bottom
screen edge are clipped. Invalid dynamic handles, frame numbers or coordinates
draw nothing; literal starting coordinates outside the screen are compile errors.

There is one background-clip layer. Moving it, changing its size, or selecting
another clip clears its previous dynamic cells to blank background palette 0.
Ordinary text and map tiles elsewhere are preserved. Drawing another clip before
refreshing first commits the previously queued clip, so the renderer can safely
reuse a buffer. Normal sprite drawing can be layered over the clip.

Call this once to show a still frame, or select frames in your own game loop.
This feature does not automatically play an animation or provide video decoding.
Your program decides timing and whether to loop, pause, advance or reverse.

## Why this can show more artwork

Ordinary maps keep their tile patterns resident. Clips instead keep their full
patterns in cartridge ROM and reuse two small VRAM buffers. While you see one
frame, the runtime fills the other buffer. The completed picture is selected
at a display boundary. The LCD stays on during uploads.

Repeated patterns within each frame share storage. The largest frame determines
the buffer size; all clips share those same two buffers. The budget is:

```text
resident font/sprite/map patterns + 2 × largest clip frame pattern count <= 256
```

If the program also declares streamed actors, add their reserved buffer slots
to that budget. Actor and background-clip buffers are disjoint; neither
overwrites the other's patterns. The build report counts their combined cost.
Actor programs may include a smaller font containing only the glyphs they need.

With the standard 95-tile font and no other resident graphics, a frame can use
at most 80 different tile patterns. Extra sprite or map patterns reduce that
limit. A frame can cover more screen cells than this if cells repeat patterns.
For sufficiently large sequences with many common patterns, Pyson can keep
those patterns resident once instead of uploading them with every picture.
The report includes them in resident tiles and lists them separately as
persistent clip patterns. Buffer counts then describe only the patterns still
streamed per picture. A fully persistent picture needs no pattern upload.
The compiler also tries keeping extra patterns used by the largest pictures.
One permanent pattern can replace a pattern in both working buffers, saving
space overall. It accounts for actor-buffer alignment and keeps a layout only
when the calculated tile reservation improves. This changes neither your drawing
calls nor the artwork. The search is a heuristic, so a rejected picture may
still need a different asset layout.
Moving/resizing a clip still clears its old cells, including persistent ones;
ordinary text and maps outside it remain intact. Imported palettes remain
independent, even when their starting colors match.

The compiler reports excess patterns; it does not silently simplify artwork.
The build report lists the largest frame and the shared buffer reservation.

Tile patterns are exact after normal four-color BMP conversion. The example
demo's artwork was deliberately simplified while authoring it to meet its tile
budget; that simplification is not performed automatically by the compiler.

Each frame and its index are placed in ROM banks automatically. Large sheets
can require MBC5 and a larger ROM, but they do not allocate a RAM framebuffer.
The renderer enables the hardware frame clock and services audio during uploads.
Frame preparation still takes CPU time and may delay game logic and input.

## Current limits

- Fixed backgrounds only: clips cannot currently share a ROM with world cameras,
  streamed worlds, or fixed window/HUD routines. Ordinary sprites, text and maps
  remain available.
- One clip layer; this is not multiple independent full-screen video surfaces.
- No promise of 60 animated pictures per second. Measure the intended artwork
  on both models. CGB double CPU speed can prepare pictures faster.
- Cooperative audio servicing remains in use; this is not a separate audio
  interrupt engine.

[God in the Circuit](../examples/god-in-the-circuit/README.md) is a complete
seven-movement example with prepared clips, live sprite geometry, palette
transitions and original music.
