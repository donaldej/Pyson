# Full-screen pictures between scenes

## Scrolling credits and tall pictures

`scroll_image(path)` imports a 160-pixel-wide BMP between 144 and 2040 pixels
tall, with dimensions divisible by eight and at most 256 different tile
patterns. `show_scroll(image, y=0)` shows a 144-pixel-tall section. `y` counts
pixels down from the top; values outside the image are clamped to its edges.

```python
credits = scroll_image("assets/credits.bmp")
for y in range(601):
    show_scroll(credits, y)
    refresh_screen()
    wait_frames(3)
clear_screen()
```

Normal movement streams the newly exposed row and uses hardware pixel scrolling.
A large jump reloads the map as a transition. The picture temporarily owns the
screen and uses its own colors. Call `clear_screen()` before resuming ordinary
game graphics. Tall images can coexist with masked sheets in a ROM but are
shown separately. They do not add a second full-screen RAM buffer. No extra
tool or dependency is needed to build a game that uses one.

Use a screen image for a detailed title, credits page, or another still picture
that fills the display. It can use up to 256 different tile patterns without
leaving room for your game's sprites or font at the same time.

```python
title = screen_image("assets/title.bmp")

show_image(title)
refresh_screen()

# Read buttons or wait here while the picture stays visible.
wait_frames(120)

# Bring the normal graphics back before drawing the game.
clear_screen()
print("READY", 0, 0)
refresh_screen()
```

`screen_image(path, palettes=1)` imports one **160x144 BMP**. Declare it at the top level,
like other assets. The normal four-color BMP conversion applies. Repeated tiles
share space within the picture. A picture with more than 256 different patterns
is rejected. The compiler puts its data in cartridge ROM automatically.
Different screen images reuse the same graphics memory; their tile counts do
not add to the game's resident tiles, actor buffers or background-clip buffers.
No original source image generator is needed to build a project with its BMPs.

`show_image(image)` replaces the whole display and hides all sprites. Call
`refresh_screen()` immediately afterwards, **before waiting for frames**. Until
that refresh the display is stopped while the runtime prepares the picture.
If you queue another image first, only the last one is presented. Invalid
handles leave the current display alone. Both functions accept named arguments:
`screen_image(path="assets/title.bmp")` and `show_image(image=title)`.

While the picture is visible, you can read buttons, wait, play audio, and change
background palette 0. Do not draw text, sprites, maps, actors or clips over it:
its patterns temporarily replace those graphics. Call `clear_screen()` first.
That restores the ordinary graphics and the palette 0/monochrome shade mapping
that existed before the first image. It leaves sprites hidden; draw them again.
Cached actor poses are invalidated so drawing the same pose uploads it correctly.
The other palette slots keep their existing values.

A screen image initially uses its imported colors in background palette 0.
`bg_palette(0, color0, color1, color2, color3)` can change those colors. On DMG,
while a screen image is active, the requested colors are mapped to the nearest
of the four available shades. Changes are presented at a display boundary.
For a two-color image, the second imported color is usually black; keep that
entry black when fading the white pixels. Palette changes in ordinary graphics
retain their existing behavior.

These are **screen transitions, not a movie player**. Loading a picture stops
the LCD briefly and does not advance the display-frame counter during that
upload. Image data is copied from ROM without allocating a pixel framebuffer.
Repeated full-screen uploads are not intended for smooth animation; use actors,
background clips, sprites, or scrolling for that. Screen images currently need a
fixed background: window HUD and world-camera/streaming routines cannot share
the same program. Ordinary fixed maps, sprites, actors and background clips can.

The optional emulator test exercises a 256-pattern picture, two-color DMG
shades, fades, invalid handles, replacement before refresh, and repeated
restoration of text, an actor and a background clip on DMG and CGB:

```powershell
node --test tests/screen-images.test.js tests/screen-images-runtime.test.js
```


## Packed menu pages versus a scrolling background

A tall BMP can hold separate complete screens rather than one continuous picture. If it contains stacked 144-pixel menu pages, select page 0 at offset 0, page 1 at 144, and so on:

```python
menu_pages = scroll_image("assets/menu-pages.bmp")
show_scroll(menu_pages, page_number * 144)
refresh_screen()
```

Do not animate intermediate offsets in such a file: that displays parts of two unrelated screens together. Continuous background art can use intermediate offsets normally.


## Small changes without a screen flash

`show_image()` can keep the LCD running when switching between nearly identical pictures that use the same palettes. The compiler gives those pictures shared tile numbering, and `refresh_screen()` presents their changed maps together. This suits a selection pointer moving between otherwise unchanged menu pictures. Your Pyson calls stay the same.

This is automatic when the pictures qualify. Loading a different illustration or changing its palette set still requires a full image transition. A set of unrelated pictures is not a smooth animation system. Picture changes continue to hide ordinary sprites. Packed menu screenshots still require the whole-screen offsets explained above.
