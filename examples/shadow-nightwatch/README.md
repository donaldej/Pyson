# Shadow Terminal: Nightwatch

A separate military sci-fi audiovisual demo in the style of Shadow Terminal,
with new background animation and a new original score. The earlier example
remains in examples/shadow-terminal/.

```powershell
npm.cmd run build -- examples/shadow-nightwatch/main.pysn shadow-nightwatch
```

Open binary/shadow-nightwatch.gb. **Start** pauses/resumes; **A** advances.
The roughly 64-second sequence repeats on Game Boy and Game Boy Color.

The center displays **DEFCON 5 -> 4 -> 3 -> 2 -> 1**. Each level lasts ten seconds,
with a large digit and a timer from 00:10 down to 00:01. Opening and closing
mechanical crests display **SHADOW TERMINAL**; the finale adds a small Pyson
credit. There are no scene-title captions along either screen edge and no
warning beeps before transitions. DEFCON 1 represents fictional maximum
readiness, not a weapon firing.

New animated imagery includes watch towers, mirrored frequency banks, a
segmented orbital cage, chevron conveyors and a turbine containment chamber.
Cold blue palettes move toward amber and burgundy as readiness rises.

The soundtrack develops from sparse pulse figures into denser military
electronics at about 128 BPM. Four movements use eight harmonic bars apiece,
with sixteen-step melody phrases, gated bass, shifting accents, rests and
syncopated percussion. Adjacent readiness levels can share a continuous musical
movement. There are no audio samples or external audio playback dependencies.

## Source layout

- main.pysn controls the seven visual parts and hardware-frame countdown.
- includes/art.pysn selects clips and palettes.
- includes/overlay.pysn draws the readable sprite-based digits and name.
- includes/score.pysn selects movements and keeps percussion aligned with its
  own clock, including across pauses and visual changes.
- assets/ includes every BMP and music JSON required to build.

The backgrounds use small, exact reusable tile patterns. The 24-frame clips
share graphics across frames; the foreground is drawn independently with
sprites. The animation is asset-based, with runtime timing and moving sprite
telemetry; it is not playback of an MP4.

## Review

Let one full cycle run and check the five countdown levels, the opening and
closing name, evolving music and changing imagery. Pause during a countdown,
wait a few seconds, then resume: the timer and music should pick up together.
Check A advances cleanly. Both emulated hardware models are checked for timing,
audio, controls and the ten-sprites-per-scanline limit.

Optional PyBoy tools are dev-tools/recordings/shadow-nightwatch-check.py and
shadow-nightwatch.py; recording additionally uses FFmpeg. These are not build
prerequisites. No compiler changes or new required tools are introduced.
