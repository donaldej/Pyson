# Streamed actors

An actor is one large animated character. Its artwork can contain many poses
without keeping every pose in video memory at once. You choose its pose and
position; Pyson handles loading the pixels and assigning sprite slots.

```python
header.target = "dual"
header.controller = "mbc5"
hero = actor_sheet("assets/hero.bmp", width=48, height=64)

while True:
    read_buttons()
    draw_actor(hero, frame=0, x=40, y=48)
    refresh_screen()
```

This expects your own BMP sheet, with 48-by-64-pixel pictures arranged left to
right, then top to bottom. Frame numbers start at zero. A frame's transparent
canvas counts toward its width and height, but completely transparent 8-by-8
cells do not use hardware sprites. Pyson also looks for better ways to pack
the visible pixels without moving or resizing them. Use the same canvas and body anchor for
every pose to avoid the character jumping sideways when an animation changes.

The example holds pose zero. For animation, select another frame using your
game's timing. For movement, change `x` and `y`. This API does not add physics,
animation playback, hitboxes, collision or an enemy brain.

## Calls and lifetime

- `actor_sheet(path, width, height)` declares one actor at module top level.
  Paths and dimensions are literals. Dimensions are multiples of eight, from
  8 through 128 pixels, and must divide the image. At most 255 poses per sheet.
- `draw_actor(actor, frame, x, y, flip_x=False, flip_y=False)` selects its pose
  and pixel position. Position is the canvas's upper-left corner. Flips reflect
  both the image and its layout across the complete canvas. All drawing
  arguments can change at runtime. Use `refresh_screen()` to present changes.
- `hide_actor(actor)` hides its complete reserved sprite range. Showing it
  again can reuse its cached pose.

Two declarations create two independent actors, even if they name the same
BMP. Assigning an existing handle to another variable aliases that same actor;
it does not create another instance. Importing its module again also does not
create a new actor. Invalid runtime handles or frame numbers leave the display
unchanged. Off-screen components are clipped; partly visible 8-by-8 cells use
the hardware's normal edge clipping. There is no automatic wrapping.

## Why changing position is cheaper than changing artwork

Pyson reserves two small pattern buffers per actor, sized for its most detailed
pose. While one is visible, it loads a new pose into the other. The next display
commit changes sprite references to the finished pose. The LCD stays on.

Drawing that same pose at a new position does not upload its pixels again.
This is useful for smooth walking or jumping between less frequent pose changes.
A detailed new pose still takes time to upload; this is not a promise of sixty
new poses per second. If you queue two different poses before refreshing,
Pyson first commits the preceding pose so it cannot overwrite visible pixels.

## Limits to plan around

Pyson uses 8-by-16 hardware components automatically when all actor heights
are multiples of sixteen and the program has no ordinary sprite sheets. This
can roughly halve the sprite cost of tall characters. Other programs use
8-by-8 components. The API and pixel coordinates remain the same. Completely
transparent components are omitted, and padding alignment is optimized during
compilation. Actor programs include only the font glyphs their text, numeric
formatting and applicable runtime diagnostics need. File paths, button names
and palette hex strings do not count as printed text. Dialogue border glyphs
and pool-error glyphs are retained when those features are present.

Each pose must use at most 40 components, and the largest pose counts of all declared actors must sum to at
most 40. The hardware also allows only ten sprites crossing any horizontal
scanline. Automatic slot assignment does not remove that second limit.

Actors reserve consecutive slots from the high end of the 0..39 sprite range.
The build report identifies the first slot and number reserved for each actor.
If you also use ordinary `sprite()`, keep its entire component range below the
lowest actor reservation. Do not hide an actor with `hide_sprite()`; use
`hide_actor()` so every reserved component is cleared.

Fonts, ordinary maps and ordinary sprite sheets are resident. Their patterns
plus all actor buffers must fit 256 tile slots. For example, an actor with at
most 24 unique patterns in one pose reserves 48 tile slots for its two buffers.
The compiler reports an excess rather than silently degrading the artwork.
Large sheets can also use more cartridge ROM, placed in banks automatically.
Actors can share a program with background clips: each renderer receives
separate pattern buffers, all counted in the same 256-slot budget. Streamed
worlds are not supported in the same program yet. Fixed maps, ordinary sprites,
text, fixed windows and audio are allowed; background clips retain their own
restriction against fixed windows. Ordinary sprite sheets cause automatic
fallback to 8-by-8 components for compatibility.

Transparency follows ordinary sprite-sheet rules: meaningful 32-bit BMP alpha
is preferred; otherwise the first pixel's color is the transparent key. There
are three opaque colors per actor palette on both hardware models. Four opaque
source colors are quantized, just as with ordinary sprites. Color palettes
can be replaced with `sprite_palette(index,...)`; consult the build report for
the imported slot. DMG actors use object palette 1 with white, light gray and
black. Any ordinary sprite using that same DMG palette shares this mapping.

The actor declaration, its frame data and its reservations are included only in
programs that use the feature. No new external tool or runtime dependency is
required to build it.

When actors share a program with background clips, short input presses are
retained across slow picture preparation. Continue using the normal button APIs;
see [input buffering](input.md#input-during-large-redraws). This improves input
capture, not the time needed to prepare a large picture.
