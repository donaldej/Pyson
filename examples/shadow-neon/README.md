# Shadow Terminal: Neon Rain

An original neon-noir Shadow Terminal demo for Game Boy and Game Boy Color,
inspired by the atmosphere of rain-soaked dystopian science fiction. The art,
score, signage and synthetic identity are original; it uses no film footage,
characters, logos or music.

```powershell
npm.cmd run build -- examples/shadow-neon/main.pysn shadow-neon
```

Open `binary/shadow-neon.gb`. **Start** pauses/resumes; **A** advances. Five
roughly ten-second parts repeat:

- A dense neon megacity with SHADOW TERMINAL integrated into vertical signs.
- An enormous artificial eye with a moving pupil and optical scan.
- Corporate pyramids framing a live **DEFCON 5 -> 4 -> 3 -> 2 -> 1** alert.
- A wet, stationary neon alley with reflected light and a distant silhouette.
- An artificial identity revealing SHADOW TERMINAL and the Pyson credit.

Twelve independent sprite raindrops fall over the animated backgrounds. On
Color hardware, dark teal, magenta, amber and violet support the noir palette.
Original Game Boy displays the same artwork in monochrome.

The DEFCON sequence appears in the corporate-alert part. Each level lasts two
seconds and shows 00:02 then 00:01. There are no scene-name captions and no
warning beeps before transitions. The alert is a fictional readiness simulation.

The new original chiptune score uses suspended minor-key melodies, long pulse
notes, a warm sine/triangle wave-channel arpeggio and restrained percussion.
Three movements continue across related scenes. Both music and the visual
timeline pause together; the percussion clock compensates for paused time.

## Source and build

`main.pysn` runs the sequence and countdown. `includes/art.pysn` selects clips,
sets palettes and moves the independent rain layer. `includes/overlay.pysn`
draws the live alert; `includes/score.pysn` handles music and percussion.
All necessary BMP and music JSON assets are included. The example builds with
the normal Pyson setup, with no extra required tools or asset-generation step.

Background animation is authored into 24-frame clips built from exact reusable
tile patterns. Pyson runs their timing, rain motion, alert and audio at runtime;
this is not MP4 playback. Earlier demos and the compiler remain unchanged.

Let a full cycle play to check rain, pupil motion, all five DEFCON levels, the
neon reflections and the final identity. Pause, resume and try A to advance.
Optional tools `dev-tools/recordings/shadow-neon-check.py` and `shadow-neon.py`
test or capture the demo with PyBoy. Video capture additionally needs FFmpeg;
neither is a build prerequisite.
