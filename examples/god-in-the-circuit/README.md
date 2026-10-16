# God in the Circuit

A two-minute original audiovisual demo for Game Boy and Game Boy Color: a
signal becomes a mechanical iris, folds into a shaded form, opens into a
mathematical cathedral, reveals an eye and a turning synthetic face, and resolves
into Pyson. Each movement dissolves into the next; the ending returns to the
opening waveform. The original industrial chiptune score develops one motif
across seven arrangements, including a restrained eye passage before the beat
returns.

```powershell
npm.cmd run build -- examples/god-in-the-circuit/main.pysn god-in-the-circuit
```

Open `binary/god-in-the-circuit.gb` in your preferred Game Boy emulator.

**A** advances to the next movement. **Start** pauses/resumes. In PyBoy those
are keyboard A and Enter. The show loops. Both models have the same timeline;
Color adds authored palettes and uses double CPU speed. No special cartridge
hardware beyond standard MBC5 is required. Actual hardware testing is still
needed; the automated checks use emulation.

## What runs live

The `.pysn` program handles the musical timeline, frame selection, color
transitions, input, scanline occupancy and sprite geometry. Perspective division
in the shaded-form movement and the answering waveform trace run on the Game
Boy CPU. Two music voices and pulse/noise effects play through Pyson's audio
runtime. The code does not contain handwritten assembly or modify a compiled ROM.

The full-screen shaded images are prepared artwork, **not runtime ray tracing**.
Each of the seven 6x7 BMP sheets contains 42 pictures: 28 loop frames followed by
14 transition frames. Artwork was simplified during authoring to at most 72
different tile patterns per picture. The compiler preserves that supplied image
after ordinary BMP palette conversion. Some simplified contours remain visible.

Unlike Prism Forge's globally shared pattern atlas, these pictures can have
different patterns in each frame. Pyson's [background clips](../../documentation/background-clips.md)
upload into an invisible VRAM buffer and commit a finished frame at a display
boundary. The LCD stays on. Repeated screen cells share tile patterns, and the
same two buffers serve every movement. This makes much more artwork possible
without putting every picture in VRAM or allocating a RAM framebuffer.

This is a hybrid presentation using both prepared imagery and live calculations.
It is not a claim of 60 animated pictures per second: heavier uploads take
multiple display frames, particularly on DMG. Elapsed-frame scheduling keeps the
musical timeline from slowing down with the graphics rate.

## Files

- `main.pysn`: the complete timeline and controls.
- `includes/art.pysn`: seven background clips and the original photon sprites.
- `includes/visuals.pysn`: clip selection, live geometry and sprite budgeting.
- `includes/palettes.pysn`: prepared color-transition steps.
- `includes/score.pysn`: musical arrangement selection and percussion.
- `assets/`: all required BMPs and original JSON compositions.

The included assets are sufficient to build. No generator, Python package or
image editor is required for compilation.

## Verification and recording

```powershell
npm.cmd run test:circuit
```

The optional PyBoy test runs the whole show on DMG and CGB, checks animation and
audio in each movement, checks pause/resume and skipping, and monitors pattern
writes for inaccessible VRAM or overwrites of the visible clip buffer. It also
checks the sprite scanline limit and captures review sheets under
`build/god-in-the-circuit-preview/`.

With optional PyBoy and FFmpeg installed, record an MP4 with synchronized audio:

```powershell
tools/emulator-env/Scripts/python.exe dev-tools/recordings/god-in-the-circuit.py
```

The default recording is `binary/god-in-the-circuit.mp4`. Neither emulator tests
nor recording tools are required to build the ROM.
