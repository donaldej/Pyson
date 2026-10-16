# Prism Forge

An original abstract audiovisual demo for Game Boy and Game Boy Color. Five acts
replace landscape travel with a rotating faceted crystal, folding ribbons, a
trefoil knot, a pulsing eclipse, and a machine-mask Pyson finale. An original
electronic score uses pulse melody, custom wave bass, kick, snare and hats.

```powershell
npm.cmd run build -- examples/prism-forge/main.pysn prism-forge
```

Open `binary/prism-forge.gb` in an emulator or on compatible hardware.

**A** advances to the next act. **Start** pauses/resumes. The approximately
65-second presentation loops. On PyBoy, A is the keyboard A key and Start is
Enter. CGB uses double CPU speed and color; DMG uses monochrome and normal speed.

## How it works

This is a hybrid demo, not a claim of full-screen real-time ray tracing. The
120 background layouts were computed while authoring the artwork and are
included as ordinary nested `tilemap()` declarations. They share 112 patterns
in `assets/patterns.bmp`; the compiler embeds those patterns and layouts in ROM.
The image dictionary approximates the original artwork, so some tile boundaries
and simplified contours are visible. These are limits of this artwork encoding.

At runtime, ordinary Pyson selects layouts, projects live sprite geometry,
manages scanline occupancy, cycles palettes, plays music and schedules the acts
using elapsed display frames. The finale's face is a background image with live
orbiting lights. No assembly, external ROM patches, or custom rendering runtime
are used. Rendering is not 60 updates per second; the hardware screen retains
its normal refresh rate while heavier graphics updates take multiple frames.

`includes/visuals.pysn` contains the runtime effects. `includes/frames*.pysn`
contains the image layouts; these are asset data, not hand-written game logic.
`includes/tiles.pysn` shows [atlas selection](../../documentation/tilemaps.md#taking-tiles-from-one-image).
`includes/score.pysn` handles the music. All required artwork and score data are
included; building does not require an asset generator or additional packages.

The ROM uses MBC5 with automatic bank placement. The build report gives exact
ROM, RAM and resident tile costs. Existing demo projects remain unchanged.

## Verification

```powershell
npm.cmd run test:prism
```

Requires the optional emulator environment. Runs a full loop on DMG and CGB,
checks every act changes visually and produces audio, checks the sprite scanline
limit, and writes review sheets under `build/prism-forge-preview/`. Emulator
testing does not replace testing on physical hardware.
