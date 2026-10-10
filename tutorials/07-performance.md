# 7. Timing, streaming, and performance

Goal: keep game time consistent and inspect actual budgets before optimizing.

## Step 1: separate elapsed time from update count

Build [Frame Timing](../examples/frame-timing/main.pysn):

```powershell
npm.cmd run build -- examples/frame-timing/main.pysn frame-timing
```

The character travels back and forth. Hold A to add CPU work: drawing becomes
less frequent, but travel pace remains consistent. Find these statements:

```python
delta = elapsed_frames(previous)
previous = (previous + delta) & 32767
timeline = (timeline + delta) % 576
```

`delta` measures elapsed display frames, including frames spent doing work.
Advancing the saved timestamp by delta handles counter wrap without losing a
gap between two independent clock reads. The example divides timeline by two
to move approximately 30 pixels/sec, then reflects the path at screen edges.

Using a frame helper enables the clock at startup and switches cooperative audio
to elapsed-frame accounting. It does not make slow drawing smooth or reproduce
notes missed during a long computation. The clock pauses during LCD-off loads.
Animation still needs explicit `update_animations`; the example bounds delta
to its supported 0..255 ticks. Collision-sensitive games may need several small
simulation steps rather than one large movement jump.

Compare [CPU Speed](../examples/cpu-speed/main.pysn): that example intentionally
moves once per update, so more CPU capacity can change its travel pace.

## Step 2: keep immutable data out of working RAM

Open [Lucid Circuit's motion tables](../examples/lucid-circuit/includes/motion.pysn).
`constant_table` looks like a list declaration, but its elements stay in ROM.
Read/index/iterate it when values never change. Use ordinary arrays for mutable
inventories or simulation state; do not replace a writable array with a ROM
table and expect element assignments to work.

## Step 3: stream a world larger than the viewport

Build [Streaming World](../examples/streaming-world/main.pysn):

```powershell
npm.cmd run build -- examples/streaming-world/main.pysn streaming-world
```

Move with the D-pad and use A to jump between regions. Follow main's `draw_world`
and camera calls into [the world declaration](../examples/streaming-world/world.pysn).
The runtime streams a bounded working set of tiles instead of loading all world
graphics into VRAM. A large ROM does not remove local tile-window budgets.
Background repetition is deduplicated; only genuinely different graphics need
different tile data.

## Step 4: measure, then change

After installing the optional emulator environment:

```powershell
npm.cmd run profile -- examples/frame-timing/main.pysn --target cgb --frames 600
```

Read the reported work/wait percentages and refresh intervals, then inspect
`build/frame-timing.report.json` from the normal build for memory and bank use.
Profile output has its own `profile-*` name and lives under `build/profiles/`.
Source checkpoint visits indicate frequency, not exact CPU cost per statement.
This unattended profile does not press A; it measures the light path. To measure
the heavy branch, temporarily select it in a copied project and profile that
copy. Do not infer the interactive worst case from the light-path report.

## Try it

Copy Frame Timing, set `header.cpu_speed` to `"normal"`, and compare against the
double-speed build on Color hardware. Travel time should remain similar while
the heavy workload permits fewer draws. Then inspect both linked reports rather
than guessing that CPU speed changes RAM usage.

References: [frame timing](../documentation/frame-timing.md),
[ROM tables](../documentation/constant-tables.md), [streamed worlds](../documentation/worlds.md),
[banking](../documentation/banking.md), [profiling](../documentation/advanced-rendering-notes.md).

[Previous](06-game-systems.md) · [Next: advanced demo study](08-visual-demos.md)
