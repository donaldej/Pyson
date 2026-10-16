# BMP assets

Declare assets in top-level assignments with literal paths and dimensions:

```python
hero = sprite_sheet("assets/hero.bmp", 16, 16)
level = tilemap("assets/level.bmp")
```

Compilation reads paths relative to the `.pysn` file, converts pixels into
Game Boy 2bpp tiles, deduplicates tiles, and embeds maps and palettes in the ROM.
No manual conversion is required. Asset handles can be passed to `sprite` and
`draw_map`; see [graphics](graphics.md).

Use [nested tile maps](tilemaps.md) to assemble maps from individual 8x8 BMP
tiles with per-tile palettes, solidity, and terrain labels.
You can also select tiles from one shared BMP atlas with
`tile("assets/tileset.bmp", x=2, y=1)`. Coordinates count 8x8 tiles from the
top-left; selections share the image palette. See
[atlas selection](tilemaps.md#taking-tiles-from-one-image).

## Formats and layout

- Uncompressed Windows BMP with 1, 4, 8, 24, or 32 bits per pixel is supported,
  including top-down images. Compressed BMPs are rejected.
- Image dimensions must be multiples of eight. Ordinary `tilemap` BMPs can be
  at most 256x256 pixels. `draw_map` clips to the visible screen; `draw_world`
  loads a scrollable map. Larger `worldmap` BMPs use the streamed-world rules
  described in [streaming worlds](worlds.md).
- Sprite frames default to 8x8. Optional width and height must be multiples of
  eight and divide the image dimensions. Frames are read left to right, then
  top to bottom. A sheet supports at most 255 frames.
- A frame may contain at most 40 tiles, subject to available sprite slots.
- For 32-bit BMPs with meaningful alpha, alpha below 128 is transparent. With
  no alpha information (including an all-zero alpha channel), the sprite's
  top-left pixel color is the transparency key throughout the sheet.
- Transparent background pixels become white.

Each image uses one palette: three opaque colors plus transparency for sprites,
or four colors for backgrounds. Extra colors are automatically quantized with
deterministic median-cut reduction; palette colors are stored with five bits
per channel. Opaque colors are ordered light to dark for grayscale fallback.
Keep artwork within those limits when exact colors matter.

## Budgets

The current shared tile pool has 256 entries. The built-in font occupies 95,
leaving up to 161 additional unique tiles; identical tiles across assets share
entries. Exceeding this resident budget is a compile error. Streamed worlds
instead use a bounded cache in the remaining slots; their complete graphics
need not all fit simultaneously. They still must satisfy the local working-set
limits in [streaming worlds](worlds.md).
Static graphics and layout data use [automatic ROM banking](banking.md).
User-defined functions share the available banks; main and runtime routines remain in bank 0.

Sprite imports automatically receive palettes 0..7. Background imports receive
palettes 1..7; background palette 0 is reserved for text by default. Repeated
imports with the same file, kind, and dimensions reuse their handle and palette.
Use `sprite_palette` or `bg_palette` to override an imported palette at runtime.

Builds write `build/name.assets.json` with dimensions, frame maps, palette
indices, and tile counts. These maps use the compiler's shared tile indices.

## Standalone conversion

```powershell
npm.cmd run convert:bmp -- examples/assets/hero.bmp build/hero sprite 16 16
npm.cmd run convert:bmp -- examples/assets/garden.bmp build/garden background
```

Output files:

| Extension | Contents |
| --- | --- |
| `.2bpp` | Unique tiles, 16 bytes each |
| `.map` | Local tile indices, row-major within each frame |
| `.pal` | Four little-endian RGB15 colors, eight bytes total |
| `.json` | Dimensions, frame layout, palette, maps, and conversion metadata |

Standalone indices refer to that export's own tiles. The compiler remaps assets
into its shared tile pool. The example BMPs are included in the repository and
can be edited with a bitmap editor. No asset-generation step is needed to build
the examples.
