# Frame Timing

```powershell
npm.cmd run build -- examples/frame-timing/main.pysn frame-timing
```

The character travels back and forth at approximately 30 pixels per second,
while an original two-voice melody plays. Hold A to add deliberate CPU work.
The drawing becomes less frequent, but travel time, animation time, and musical
sequence timing follow elapsed display frames.

This dual-target ROM uses double CPU speed on Color and normal speed on
monochrome hardware. Set `header.cpu_speed` to `"normal"` to compare Color CPU
budgets. The travel pace remains the same.

The source uses `elapsed_frames(previous)` and an integer timeline. There is no
special game-loop syntax. Read [hardware frame timing](../../documentation/frame-timing.md)
for waits, wraparound, audio servicing, and collision considerations.
