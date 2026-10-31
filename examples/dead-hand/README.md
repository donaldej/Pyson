# Dead Hand

An original military sci-fi audiovisual demo for Game Boy and Game Boy Color.
The fictional command network is a simulation: DEFCON 1 represents maximum
readiness, rather than a weapon firing.

Build from the repository root after the normal Pyson setup:

```powershell
npm.cmd run build -- examples/dead-hand/main.pysn dead-hand
```

Open `binary/dead-hand.gb` in your emulator or on compatible hardware.
No asset generator, emulator, or video tool is required to compile it.

The four acts run for approximately 20 seconds each and repeat:

1. **Acquire Signal:** circular radar sweep and orbital contacts.
2. **Readiness Control:** DEFCON **5 → 4 → 3 → 2 → 1**, four seconds at
   each level. `NEXT LEVEL IN` counts down the seconds; at DEFCON 1 it counts
   down to the next act. The display changes to amber at the highest readiness.
3. **Trajectory Lock:** moving tracks over a tactical intercept grid.
4. **Autonomous Core:** an armoured command intelligence with orbiting telemetry
   and a Pyson credit.

**Start** pauses/resumes the timeline and music. **A** advances to the next act.
The original soundtrack combines pulse-channel sequences, wave-channel saw bass,
marching percussion, and readiness alarms. Both hardware models play the score;
Color hardware adds green and amber console palettes and double-speed execution.

`main.pysn` contains the visual timeline, `includes/motion.pysn` holds a small
read-only sine table, and `includes/score.pysn` schedules the music and percussion.
The BMP and JSON files in `assets/` are all the source assets needed for a build.
The animation runs as Pyson code; this is not playback of a prerecorded video.

Optional maintainer tools in `dev-tools/recordings/dead-hand.py` and
`dead-hand-check.py` capture a video or check both emulated hardware models.
They require the optional PyBoy environment; recording also requires FFmpeg.
