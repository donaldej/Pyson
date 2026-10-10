# Void Engine

A noninteractive, six-scene Pyson demo for both the original monochrome Game
Boy and Game Boy Color. The same ROM runs on either model; Color adds animated
neon palettes. One complete show lasts approximately 108 seconds, then loops.
Neon Requiem remains a separate, unchanged example.

## Build and test

From the project root in PowerShell, after the normal development setup:

```powershell
npm.cmd run build -- examples/void-engine/main.pysn void-engine
npm.cmd run test:void-engine
```

The ROM is `binary/void-engine.gb`. The test requires the optional PyBoy
environment installed by `npm.cmd run setup:emulator`. It runs a complete show
on both DMG and CGB, checks visible streamed tiles against the source artwork,
camera progress, legal VRAM write timing, sprite limits, both music voices,
and a save/reload of the completed-show counter.

Copy the ROM to your EverDrive GB X7 SD card and launch it normally. The
[manufacturer lists MBC5 and both Game Boy models as supported](https://everdrive.me/cartridges/edgbx7.html).
Emulator checks pass on both models; physical EverDrive playback still needs
testing. No controls are required.

## The show

1. **Eclipse:** a striped planet, slowly moving camera, and drifting sparks.
2. **Neon highway:** a vertically streamed 1,024-pixel road with optical depth.
3. **Metropolis:** a one-way flight through four city districts, with animated
   thrusters and a separate moving foreground.
4. **Machine cathedral:** eight procedural architectural sections with orbiting
   particles and a musical breakdown.
5. **Vortex:** a perspective-projected, rotating particle torus inside a lattice.
6. **The engine:** a 48-by-48 mechanical sentinel rising beneath the Pyson logo,
   with orbiting sparks and the final musical section.

Every scene has its own background artwork and musical arrangement. Small
particle sprites are shared intentionally. The score is original: pulse lead,
wave bass, and alternating synthesized kick, snare, and hi-hat effects.

## Hardware budgets and implementation

The cartridge uses MBC5 with 8 KiB of battery-backed RAM. Save slot zero records
completed shows. The linked ROM is 128 KiB, with code and artwork occupying
five ROM banks; capacity follows the cartridge's power-of-two sizing rather
than padding to an arbitrary maximum.

This build uses 3,027 of Pyson's 4,096 WRAM bytes, leaving 1,069 bytes free.
Its immutable geometry uses ROM-resident `constant_table()` declarations,
freeing 896 WRAM bytes compared with the original ordinary-list version.
The resident font and sprite artwork occupy 144 tiles, leaving 112 tile slots
for the streaming cache. Large backgrounds are banked worlds whose visible
tiles are loaded as the camera advances. Cartridge RAM does not expand CPU
speed, internal WRAM, or VRAM.

The finale uses all 40 sprite slots: 36 components for the sentinel and four
particles. The test observes at most ten sprites on a scanline across the show.
The torus uses 24 projected points and 16 precomputed poses, stored in ROM
tables. The generator culls crowded scanlines; runtime code updates point
cohorts to spread the work across refreshes. This is precomputed geometry, not
a general-purpose real-time 3D renderer.

`refresh_screen()` provides the cooperative timing for visuals and music.
Scene ticks can take multiple hardware frames, so the demo does not claim
60 visual updates per second. Streaming and sprite work remain within the
existing compiler's facilities; this example adds no compiler extensions.

## Source and assets

- `main.pysn`: cartridge configuration, scene timing, and persistent counter.
- `includes/visuals.pysn`: palettes, cameras, sprite placement, and scene effects.
- `includes/score.pysn`: music selection and percussion patterns.
- `includes/geometry.pysn`: generated packed projection and orbit tables.
- `assets/`: checked-in BMP artwork and JSON music sequences.

All artwork, music, and number tables needed to build the demo are included.
No asset-generation step or JavaScript editing is needed. Edit BMP artwork in
a bitmap editor and change the included Pyson files to experiment with the demo.
