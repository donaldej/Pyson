# Shadow Terminal

A military sci-fi music demo for Game Boy and Game Boy Color. The presentation
centers on a large, live **DEFCON 5 → 4 → 3 → 2 → 1** countdown. Each level has
its own animated machinery and a ten-second timer. This is a fictional readiness
simulation; DEFCON 1 is maximum readiness, rather than a weapon detonation.

The opening and closing blast doors carry **SHADOW TERMINAL** in the center.
There are no scene names along the top or bottom. Communication relays, scanner
gates, targeting diamonds, silo indicators and a reactor lock replace the radar
maps and abstract contour animations of the other military demos. The score is
fast electronic music, with a roughly 150 BPM four-on-the-floor pulse, gated
saw bass, arpeggios and percussion. There are no escalation or transition beeps.
Faster machinery, sweeping side markers and racing packet tracers give the
presentation more movement while keeping the countdown steady and readable.

```powershell
npm.cmd run build -- examples/shadow-terminal/main.pysn shadow-terminal
```

Open `binary/shadow-terminal.gb`. **Start** pauses/resumes the animation, timer
and music; **A** advances to the next part. The roughly 64-second sequence loops.
The opening lasts six seconds, the five readiness levels ten seconds each, and
the closing eight seconds. Color hardware changes from cold green to amber and
red as readiness rises. Original Game Boy plays the same sequence in monochrome.

## Reading the countdown

The central large digit is the DEFCON level. Below it, `00:10` counts down to
`00:01`, then the next DEFCON level begins at `00:10`. Five small readiness lamps
fill from right to left. After DEFCON 1 finishes, the terminal closes and shows
its name and a small Pyson credit. The opening does not count as DEFCON 5.

## How the example works

`main.pysn` owns the timeline. It measures hardware frames so the timer does not
depend on how many times the drawing loop runs. `includes/art.pysn` plays seven
24-frame background clips, built from a small dictionary of exact reusable
architectural tiles. `includes/overlay.pysn` draws the name, large digits and
timer using sprites. That separate layer keeps text readable during background
uploads. No scanline uses more than ten sprite components.

`includes/score.pysn` starts two music voices and schedules percussion on the
remaining channels. The BMP and JSON files in `assets/` are all the assets needed
to compile. Optional authoring or emulator capture tools are not prerequisites.
This example adds no compiler features and leaves the earlier demos unchanged.

## Testing

Let the sequence run without pressing anything and check all five DEFCON levels,
their timer resets, the changing backgrounds, and the closing terminal name.
Pause during a countdown and confirm both the timer and music stop, then resume.
Press A to check that it advances cleanly. PyBoy checks and a video recorder live
in `dev-tools/recordings/shadow-terminal-check.py` and `shadow-terminal.py` for
maintainers with the optional emulator environment. Recording also needs FFmpeg.
