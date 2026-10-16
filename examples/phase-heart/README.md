# Phase Heart

An original live signal demo for original Game Boy and Game Boy Color. Four
movements evolve through wave interference, concentric lenses, folded patterns
and a large Pyson signature. New pulse/wave music plays with native percussion.

```powershell
npm.cmd run build -- examples/phase-heart/main.pysn phase-heart
```

Open `binary/phase-heart.gb` in your preferred Game Boy emulator.

- **A:** advance to the next movement.
- **B:** perturb the live phase immediately.
- **Arrow keys:** move the center used by the lens movement.
- **Start:** pause/resume.

PyBoy maps these to keyboard A, S, arrows and Enter. The approximately 77-second
show loops. It uses MBC5, with automatic placement; the current build fits 32 KiB.
Color uses double CPU speed and authored palettes. DMG uses normal speed and
monochrome. Physical hardware testing has not been performed for this new demo.

## What makes this different

There are no prepared animation frames. The atlas contains only static shaded
tiles, lettering and small sprite marks. Lookup tables hold numbers, not pictures.
`includes/field.pysn` calculates changing column and row values during playback;
`draw_tile_field()` composes their sums through a tile palette in the runtime.
The changing background therefore comes from the executing program. B changes
that calculation, and the arrows change the live lens center.

Field transitions blend the actual values used by neighboring movements.
`includes/geometry.pysn` projects sparse live points, including perspective
division. The final word is static lettering over the still-running field.
The low-resolution dithered field is a deliberate visual tradeoff; this is not
the shaded full-resolution imagery used by God in the Circuit.

The native field renderer avoids repeated per-cell generated code and helper
calls. Users still write normal arrays and Python-like
expressions; no assembly or ROM patching is required in the demo source. See
[tile fields and grids](../../documentation/tile-fields.md) for the reusable APIs.

Rendering does not run at 60 updates per second. The hardware refresh rate stays
normal; elapsed-frame timing keeps the musical timeline and effect phase moving
at their intended speed. Heavy transitions and perspective work reduce the
drawing rate. God in the Circuit and the other examples remain unchanged.

## Files and verification

The commented entry point is `main.pysn`. Helpers in `includes/` separate live
field math, sprite geometry, palette choices and the score. All required BMPs,
numeric tables and original JSON compositions are included. Building needs no
asset generator, Python or new third-party dependency.

```powershell
npm.cmd run test:phase-heart
```

The optional emulator test runs a complete loop on DMG and CGB, checks changing
imagery and audio in all movements, sprite limits, pause/resume, scene skipping
and phase perturbation. Review sheets go to `build/phase-heart-preview/`.

For an optional MP4 with synchronized audio, install PyBoy and FFmpeg, then run:

```powershell
tools/emulator-env/Scripts/python.exe dev-tools/recordings/phase-heart.py
```

The default video is `binary/phase-heart.mp4`.
