# Neon Requiem

An original, noninteractive Game Boy Color audiovisual demo: dark synthwave
chiptunes, neon city silhouettes, a striped planet, a geometric reactor, and a
mechanical mask rising above the Pyson logo. It loops automatically, with no
controls or external audio files. The music and artwork are original; no artist's
recording, melody, or video is included.

```powershell
npm.cmd run build -- examples/neon-requiem/main.pysn neon-requiem
```

Open `binary/neon-requiem.gb` in a **Game Boy Color** emulator with sound enabled
and normal speed. This example deliberately targets Color rather than DMG.

## The sequence

| Scene | Visuals | Music |
| --- | --- | --- |
| Space flight | Moving star particles, glowing planet, passing meteor, camera drift | Minor arpeggios and triangle-wave bass; snare enters halfway through |
| Neon city | One-way flight through a 1,024-pixel streamed skyline, faster foreground silhouettes, right-facing animated hovercraft | Driving pulse hook, octave bass, kick/snare/hat rhythm |
| Reactor | Palette-shifted diamond lattice surrounding a perspective-projected rotating cube with hidden-edge culling and a luminous core | Sparse high arpeggios and a broken bass pattern |
| Mechanical finale | Large sprite mask, orbiting sparks, pulsing eyes, original enlarged Pyson lettering | Higher lead hook, custom wave bass, denser hats |

A natural loop took **71.0 seconds** in PyBoy at normal Game Boy Color speed.
Most visual updates occupy two hardware frames, about 30 updates per second.
Individual particles and larger foreground objects update in alternating groups.
This avoids redrawing every sprite component on every update. The finale's large
sprite occasionally takes longer; this is measured playback, not a promise of
60 FPS or sample-accurate synchronization on every emulator.

The score contains four arrangements with two 128-note voices each. Every note
lasts four cooperative audio ticks, so each section lasts 512 ticks. Pulse melody
and wave bass start together after the background transition has committed.
Custom channel-2 kick and channel-4 snare/hat effects alternate through Pyson's
single effect sequencer. They are not independent simultaneous drum tracks.
The groove is roughly 112 BPM during the steady two-frame updates.
The original four music compositions, robot-head artwork, and finale background
are preserved. Musical pacing follows the cooperative renderer, so sections can
have slightly different update rates.

This expanded version assembles to a **64 KB ROM**, with 491 bytes of WRAM left
in the measured build. The city uses automatic banked world streaming, while the
cube fits its projected geometry into 576 bytes of fixed integer array data.
The opening meteor, city hovercraft, and reactor geometry are distinct scene
assets; shared tiny star particles remain intentional.

## Project structure

- `main.pysn` owns scene transitions and the repeating timeline.
- `includes/visuals.pysn` owns graphics, camera motion, lookup tables, particles,
  sprite-slot allocation, and palette accents.
- `includes/score.pysn` selects the two music voices and schedules percussion.
- `includes/geometry.pysn` contains generated, packed projected cube poses.
- `assets/` contains the imported BMP artwork and four JSON compositions.

All artwork, music, and number tables needed to build the demo are included.
No asset-generation step or JavaScript editing is needed.

[Optional recording tools](../../dev-tools/README.md) can capture an MP4.
They are not part of the normal build process.

```powershell
npm.cmd run build -- examples/neon-requiem/main.pysn neon-requiem
npm.cmd run test:demo
```

The test command requires the optional emulator environment. It plays a complete
natural cycle, verifies scene progression, changing sprite state, audible output,
both percussion channels, and music-voice alignment. It also verifies that the
city camera never reverses, visible streamed tiles stay intact, the LCD remains
enabled during flight, and no scene exceeds ten sprites on a scanline. It creates temporary scene
captures under `build/tests/neon-requiem/`.

## How the effects work

The demo uses existing Pyson features throughout. BMP tiles are deduplicated
across assets. The long city streams through the hardware map without jumping
back to the beginning; foreground sprites provide apparent parallax. Lookup
tables approximate circular motion without floating-point math. Bit masks handle
repeating counters, and staggered updates keep per-frame work smaller. Palette
changes recolor existing tiles rather than uploading new artwork.

The reactor combines a color-cycling optical background with genuine perspective
projection of a cube. Rotation, projection, rear-facing surface tests, and edge
orientation are calculated by the asset generator. Each projected wire piece is
packed into one signed-safe word: six bits each for local X and Y, and three for
its orientation. A value of -1 hides a rear edge. Pyson decodes and animates these
poses at runtime, updating one quarter of the edge slots each turn. This is
precomputed geometry displayed with segmented sprite lines; it is not a runtime
3D engine or a prerecorded full-screen movie. The darker central aperture keeps
the bright wire segments readable against the lattice.

Only `refresh_screen()` advances the cooperative audio clock in the main loop;
adding another `wait_vblank()` there would change the relationship between the
score and visual timeline. Bulk background loads occur between arrangements
while audio is stopped. The compiler and runtime require no new features for
this project.
