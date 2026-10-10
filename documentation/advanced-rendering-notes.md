# Advanced rendering development notes

Design requirement: Python familiarity and game-development concepts should be
enough to use every public feature. Assembly, register layouts, interrupt timing,
and manual bank management must remain optional. Basic games keep their existing
syntax and workflow. This file tracks implementation and future documentation
needs; it is not the finished tutorial.

## Implemented: development profiler

```powershell
npm.cmd run profile -- examples/void-engine/main.pysn --target cgb --frames 600
```

Requires `setup:emulator`. Defaults: 600 measured hardware frames after 30 warmup
frames; DMG projects use DMG, other targets use CGB. `--target dmg` can measure
dual-compatible projects in monochrome mode. `--warmup 0` includes initial game
setup, after display/runtime initialization and the emulator boot sequence.

The command builds a separate generated `profile-*` ROM and writes results under
`build/profiles/`. It uses fresh in-memory cartridge RAM and does not load or
write personal saves. It adds no Pyson syntax, runtime buffers, or instructions;
three assembly labels expose existing runtime checkpoints to emulator hooks.

Reported work includes game code, graphics transfers, audio service, and other
runtime execution. Waiting measures the polling loops inside `WaitVBlank`.
Post-main execution (including the final cleanup refresh) is separate. Refresh intervals include both work and
waiting. Display commits count `CommitGraphicsFrame`, not all changes to the
screen: background transfers can happen elsewhere in the renderer.

Frequently visited source checkpoints are execution counts, not measured costs
per statement. Declaration aliases sharing an address count once. The pinned
PyBoy hooks cannot uniquely encode source banks above 255; those checkpoints
are omitted and their number is reported, while aggregate runtime counters
remain available. Timing uses the pinned emulator's internal cycle counter.

Frames without commits are not necessarily failures: a static scene needs none.
One run without button input does not cover interactive paths or certify physical
hardware. CPU work and wait percentages describe the observed path, not a promise
that all remaining time can be assigned to graphics. Source counts and timing
instrumentation add host processing overhead; guest timing must be regression
tested against an uninstrumented run.

Documentation/tutorial backlog:

- Reading a profile for a static scene, moving scene, and intentionally slow loop.
- Distinguishing update cadence, display commits, CPU work, and missed deadlines.
- Choosing representative scenes and input paths; repeatability and save state.
- Explaining renderer scheduling, raster effects, fixed-point math, and music
  cues through progressively advanced examples as those features are implemented.

## Remaining foundation work

Implemented CGB speed setting: `header.cpu_speed = "double"`, with normal-speed
fallback on DMG for dual-compatible projects. The default remains normal and
emits no speed-switch code. The switch happens at startup before game setup.
OAM DMA's fixed-cycle HRAM routine remains valid because CGB OAM DMA also speeds
up; display timing and audio pitch do not. Code can fit more work into each
display frame. Loops that previously required multiple frames may run more
updates, so motion and sequencing still depend on the existing cooperative
clock. The opt-in hardware frame clock now provides elapsed-time movement and cooperative audio catch-up. See [hardware frame timing](frame-timing.md).

The [CPU speed example](../examples/cpu-speed/README.md) illustrates the setting.
Documentation backlog: frame-dependent versus elapsed-time movement, and testing
both targets when using dual mode.

Hardware reference: [Pan Docs CGB registers](https://github.com/gbdev/pandocs/blob/master/src/CGB_Registers.md).
Validation: steady, heavy, idle, and cross-bank profiles match uninstrumented
CPU timing and WRAM on both models. A synthetic workload improves from two
display frames per update to one at double speed. A temporary fast Void Engine
build completes in about 57 seconds on CGB and 108 on DMG; the released demo is
unchanged. Its shorter fast run illustrates why elapsed-time sequencing must be
based on elapsed display frames rather than assuming one game update per frame.

The profiler does not replace the current polling clock or change audio timing.
The optional hardware frame clock is implemented. Remaining proposals: use
measured costs to improve queued graphics transfers and safe transfer budgets
at either CPU speed. Then consider raster effects, additional CGB memory,
further numeric extensions, and the abstract Phase Shift demo. Fixed-point scalar
operations are implemented; see [fractional numbers](fixed-point.md). Preserve Void Engine
and existing APIs; keep hardware-specific scheduling inside the runtime.

Implemented hardware frame timing: `frame_count()`, `elapsed_frames(previous)`, and `wait_frames(count)` use familiar integer expressions and no new game-loop syntax. Clock users enable an internal VBlank counter; graphics writes and OAM DMA are protected. Existing programs retain their prior runtime. The clock pauses during internal LCD-off loads, and audio catch-up cannot reproduce missed notes after long computations. Tutorial backlog: fixed-step collision simulation, rollover-safe timestamps, elapsed animation updates, and keeping audio service intervals short. The Frame Timing example demonstrates an A-button CPU workload without changing travel time.
