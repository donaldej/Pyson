# Lucid Circuit

A noninteractive, dreamy Game Boy Color demo: drifting blue fields, violet
spirals, teal interference patterns, and warm mandalas. Geometric particles
move over animated colors to an original four-section chiptune score.
One loop lasts approximately 92 seconds in PyBoy and repeats automatically.

```powershell
npm.cmd run build -- examples/lucid-circuit/main.pysn lucid-circuit
```

Open `binary/lucid-circuit.gb` in a Color-capable emulator or on a Game Boy
Color with a compatible flash cartridge. This example requires Color hardware;
it uses double CPU speed and a standard MBC5 cartridge. Physical hardware
playback still needs verification.

The source uses ordinary modules, functions, integer expressions, loops,
`worldmap`, `set_camera`, `bg_palette`, `sprite`, `music_file`, and
`refresh_screen`. It requires no assembly or compiler changes.

- Four 512×512-pixel worlds live in banked ROM and stream as the camera moves.
- Seven background palettes cycle through literal RGB colors. The fields are
  generated static maps; palette animation creates their flowing appearance.
- ROM-resident constant tables describe camera paths and 24-particle poses.
  Six particles update per refresh, with scanline occupancy constrained to ten.
- Two music voices run alongside percussion effects.
- The ROM is 1 MB; the linked build leaves 1,105 bytes of the compiler's 4 KB
  working RAM budget available.

`main.pysn` coordinates sections. `includes/visuals.pysn` draws them and
`includes/score.pysn` plays the music. The remaining includes and BMP/JSON
assets are included in the repository. No asset-generation step or JavaScript
editing is needed to build it:

```powershell
npm.cmd run build -- examples/lucid-circuit/main.pysn lucid-circuit
```

To validate a complete loop, install the optional emulator environment and run:

```powershell
npm.cmd run setup:emulator
node --test tests/lucid-circuit-runtime.test.js
```

Void Engine is a separate example and is unchanged by this demo.

[Optional recording tools](../../dev-tools/README.md) can capture an MP4.
They are not part of the normal build process.
