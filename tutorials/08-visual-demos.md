# 8. Study an advanced visual demo

Goal: understand a complete visual composition without mistaking its appearance
for an undocumented graphics feature.

## Step 1: watch, then locate the coordinator

Build [Lucid Circuit](../examples/lucid-circuit/main.pysn):

```powershell
npm.cmd run build -- examples/lucid-circuit/main.pysn lucid-circuit
```

Use Color emulator mode; this demo is Color-only. Watch all four sections and
the automatic repeat. Main coordinates scene selection, a tick counter, music
transitions, drawing, and refresh. The scene counter changes which routines run;
there is no hidden Python runtime managing the show.

## Step 2: follow one frame through the modules

Read [visuals](../examples/lucid-circuit/includes/visuals.pysn), then
[score](../examples/lucid-circuit/includes/score.pysn).
`prepare(scene)` loads a world and sets palettes. `animate(scene, tick)` reads
camera/particle poses from ROM tables, moves the camera, changes palettes at
intervals, and updates a subset of sprite slots. Music uses two imported voices
while percussion runs through effects.

Updating six particles at a time spreads work across updates. The generator
limits each pose's scanline occupancy because adjacent poses briefly overlap.
That limit is part of choreography design, not automatic unlimited sprite
support. ROM tables save RAM but do not eliminate the work of reading/drawing.

## Step 3: distinguish generated content from runtime movement

Read the included BMP worlds, music JSON, and Pyson files in Lucid Circuit's
`assets` and `includes` folders. They contain prepared pictures, movement tables,
palette changes, and music. All of these files are already included; you do not
need to generate them or write JavaScript to build or modify the demo.

To capture a demo as a video, use the
[optional recording tools](../dev-tools/README.md).

The flowing fields combine static tile patterns, moving cameras, and changing
colors. They are not a realtime floating-point plasma renderer. Editing the BMPs
or included data changes the content compiled into the next ROM build.

## Step 4: compare a different composition

Study [Void Engine](../examples/void-engine/README.md) and
[its main source](../examples/void-engine/main.pysn). It combines six distinct
scenes, banked worlds, a projected particle torus, and a multi-sprite finale,
with monochrome and Color behavior. Compare its scene functions with Lucid's
shared abstract-world approach. Different compositions use the same language.

[The Last Light](../examples/last-light/README.md) adds a fantasy composition:
six streamed scenes, foreground depth, an animated eagle, fractional pans, and
a final Pyson scene. Its coordinator uses elapsed display frames, and one
particle helper accepts six ROM tables. Compare those choices with Lucid's
update-count clock and its separate motion tables.

If its long lists of numbers look overwhelming, start with
[movement, sprite animation, and motion tables](../documentation/motion-tables.md), then
[the small animation-path example](../documentation/constant-tables.md#use-a-list-as-an-animation-path).
It explains what a pose is, how the game reads positions, and why Last Light's
large packed tables were generated rather than handwritten. You do not need
to use packed numbers to animate your own game.

[Oath of Stars](../examples/oath-of-stars/README.md) is a separate experiment
with streamed fantasy landscapes and geometry rotated/projected on the Game Boy.
It also uses records, a particle pool, mutable collision tiles, world sprites,
and saved completion counts. Compare its smaller work batches and arithmetic
lookup table with the prepared screen poses in the other demos. Its README
explains the performance tradeoffs and which work happens at runtime.

You can modify Void Engine or any other example to explore its techniques.

[Zero Signal](../examples/zero-signal/README.md) offers a smaller sci-fi example
with four scenes. Read its `visuals.pysn` to see a simple depth-based starfield:
each star stores a position and depth, and dividing by depth makes nearby stars
appear farther from the screen center. Its city camera moves in one direction;
the final orbit uses a small sine table rather than a large list of poses.

[Iron Litany](../examples/iron-litany/README.md) uses four different stationary
presentations. Its `cube()` function rotates and projects 3D points; its
`interference()` function changes one column of a small mutable map per update.
Compare those live calculations with prepared poses. The large finale portrait
is BMP artwork, with separate sprites providing blinking eyes and a moving halo.
If you want to keep the original for comparison, copy the whole project,
keep assets/includes together, and use another ROM name. Keep personal saves
and existing preview videos separate from your experiments.

## Try it

Copy Lucid Circuit. In `visuals.pysn`, change the phase offset in the camera
lookup and build the copy. Its path should start from another point without
changing the underlying world. Next change one sprite palette color and compare
the particles. These runtime changes are smaller and easier to reason about
than replacing the entire generated world.

Edit the included Pyson tables and palettes directly to try different motion
and colors. You can change the BMP artwork with a bitmap editor.

References: [Lucid Circuit notes](../examples/lucid-circuit/README.md),
[graphics](../documentation/graphics.md), [banking](../documentation/banking.md),
[ROM tables](../documentation/constant-tables.md), [music](../documentation/music.md).

[Previous](07-performance.md) · [Next: readable calls](09-readable-calls.md)
