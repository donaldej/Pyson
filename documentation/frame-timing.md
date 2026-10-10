# Hardware frame timing

Use these helpers when movement, animation, or audio should follow display time
rather than the number of game-loop updates. Using any of them in your source
enables the hardware frame clock at startup for that ROM. Existing programs that use none keep their
current timing and do not allocate the clock's four bytes of working RAM.

| Helper | Meaning |
| --- | --- |
| `frame_count()` | Frames since clock initialization, wrapping from 32767 to 0. |
| `elapsed_frames(previous)` | Frames since a previously recorded count, accounting for wrap. |
| `wait_frames(count)` | Wait at least this many additional display frames; 0 returns immediately. Samples input after waiting. |

Arguments are integers 0..32767. Negative literal arguments are rejected;
negative values encountered at runtime return zero or perform no wait. Compare
timestamps less than 32768 frames apart—about nine minutes—to avoid ambiguity.

```python
previous = frame_count()
x = 0

while True:
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    x = (x + delta) % 144
    sprite(0, hero, 0, x, 72)
    refresh_screen()
```

`delta` can be zero or larger than one. Advance the saved timestamp by the
returned delta, as above. A second clock read would introduce a small interval
whose frames could be omitted. Integer accumulators can express slower motion:
advance an accumulator by `delta`, then use `accumulator // 2` for approximately
30 pixels per second. All existing Python-like expressions continue to apply.

For a delay, `wait_frames(60)` lasts approximately one second. This does not
draw queued graphics: use `refresh_screen()` for that. A refresh followed by an
explicit wait adds the requested delay after the refresh, rather than setting
a target frame rate. Very large waits prevent the source from handling input
or drawing until they finish.

## Audio and animation

With the hardware clock enabled, music and sound effects account for elapsed
display frames when serviced, rather than advancing once per wait call. Both
voices share that clock. Audio controls synchronize the old state before
starting, pausing, resuming, or replacing playback.

Audio remains cooperative: it is serviced at waits and audio API calls.
Long computations can delay audible note changes; catching up preserves the
sequence's time position, but cannot reproduce already-missed sound. Yield
regularly with refreshes or waits. This is not an audio interrupt engine.

Animation remains explicit. Pass elapsed time to `update_animations(delta)`.
That routine accepts at most 255 ticks; use `min(delta, 255)` when a deliberately
long pause should skip to a bounded update, or process longer deltas in chunks
when every elapsed tick needs to be represented.

## Limits and compatibility

The display runs at about 59.73 frames per second on monochrome and Color
hardware. Color double CPU speed provides more work time without changing this
clock. Internally Pyson counts VBlank interrupts and protects graphics transfers;
users do not need to manage interrupts or assembly.

The clock pauses while the LCD is disabled, including internal bulk world or
window loads. It measures active display frames, not wall-clock time. It does
not make expensive logic finish faster or smooth out a low drawing rate.
For collision-sensitive movement, process elapsed frames in small simulation
steps instead of jumping an object through a wall in one large movement.

Hardware references: [Pan Docs interrupts](https://github.com/gbdev/pandocs/blob/master/src/Interrupts.md)
and [OAM DMA](https://github.com/gbdev/pandocs/blob/master/src/OAM_DMA_Transfer.md).

[Frame Timing](../examples/frame-timing/README.md) demonstrates unchanged travel
speed and musical timing while holding A adds substantial CPU work.
