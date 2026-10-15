# Read your build report

You do not need extra software or different Pyson code to get a report. Build
normally:

```powershell
npm.cmd run build -- examples/star-squadron/main.pysn star-squadron
```

Open `build/star-squadron.report.txt` in any text editor. The build prints its
location. `build/star-squadron.report.json` contains the same graphics information
alongside the existing variable addresses, source locations, and other details
for tools and agents.

## How much memory is left?

The first lines show the cartridge size and working RAM used/free. Working RAM
holds changing values and runtime buffers. Cartridge ROM holds code and fixed
data. Free working RAM tells you how much room remains for additional state;
the report does not measure stack usage at runtime.

## Tile positions versus unique tiles

For the supplied Star Squadron example, the report includes:

```text
examples/star-squadron/assets/stars.bmp (world)
  1280 tile positions -> 18 unique tile patterns
  Tile pattern data: 288 bytes (16 bytes per pattern)
  Sprite components per frame drawn: 0
  Palette slot: 1 (background)
  Streaming VRAM slots: 18/143 available (288 bytes)
```

The image is split into 1,280 squares, each 8x8 pixels. Many squares are
identical, so only 18 different patterns are needed. Each pattern takes 16 bytes.
The map separately describes where each pattern belongs.

The tile pattern byte count excludes map layouts, palettes, and other ROM data.
Do not add individual asset counts to estimate total graphics memory: different
assets can share the same patterns. The resident total already accounts for
sharing and includes the font. "Resident" means kept in the normal tile area.

## Large scrolling worlds

Worlds can hold more unique patterns in ROM than fit in graphics memory at once.
Pyson loads the needed patterns as the camera moves. A world report separates:

- **Unique patterns:** the complete world's dictionary.
- **Streaming VRAM slots:** tile slots assigned to that world, out of the space
  left after the resident font and graphics. The byte count is those assigned
  slots multiplied by 16.
- **Largest local tile set:** how many patterns the busiest prepared region needs.

These numbers can differ. A large dictionary does not mean all its patterns are
loaded simultaneously. Streaming slots from different worlds can also be reused;
do not sum their counts as though every scene were loaded together.

## How expensive is a sprite?

A sprite frame's component cost is its width divided by eight, multiplied by its
height divided by eight. A 16x16 ship needs four hardware components each time
you draw it. Four such enemies therefore need sixteen components. Extra animation
frames in the sheet do not multiply that simultaneous cost.

Backgrounds use zero sprite components. Hardware allows forty components total
and ten across any horizontal scanline. The report explains the asset costs;
it cannot know how many instances your running game draws or where they overlap.
It does not certify a scene's sprite layout or frame speed.

## Palettes and color reduction

Imported background and sprite palettes have separate slot lists. Background
slot zero stays available for text. The report lists each BMP's palette slot;
nested maps inherit the palettes of their source tiles.

If an import had more colors than its hardware palette allows, the report says
the colors were reduced. That can explain why an imported image looks different.
Read [BMP assets](assets.md) and [graphics](graphics.md) for palette behavior.
