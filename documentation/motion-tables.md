# Movement, sprite animation, and motion tables

**You do not need motion tables to make a basic game.** They are an optional
way to describe a planned route or visual effect. Ordinary movement and sprite
animation work independently of them.

## Three different jobs

| Technique | What it controls | Example |
| --- | --- | --- |
| Normal movement | Calculate where an object goes next | Move right while the player holds Right |
| Sprite animation | Choose which picture represents the object | Alternate walking pictures to make legs move |
| Motion table | Read positions from a prepared sequence | Make a light follow a repeating, carefully designed path |

An object can use all three. A walking character can change position based on
input while its walking pictures change. A flying creature can follow a prepared
path while its wing pictures change. Changing the picture does not automatically
move the object; changing its position does not automatically animate its picture.

## Normal movement: calculate the next position

For a player, start with a position and change it in response to buttons:

```python
# Inside your game loop, after wait_vblank() samples the buttons:
if button_held("right"):
    player_x += 1
if button_held("left"):
    player_x -= 1

sprite(0, hero, 0, player_x, player_y)
refresh_screen()
```

This is a fragment, not a complete program: declare a `hero` sprite sheet and
initial `player_x`/`player_y` values first. Each loop calculates the next position
from the current position and input. An enemy can similarly add a speed to its
position, reverse at a boundary, or chase a target. No list of positions is needed.

For solid walls, use the [movement helpers](movement.md). For fractions of a
pixel, use [fractional movement](fixed-point.md). Heavy loops may need
[elapsed-frame timing](frame-timing.md) rather than assuming one loop per frame.

## Sprite animation: change the picture

Imagine a BMP containing two pictures of a character taking different steps.
This definition alternates those pictures, holding each for eight animation ticks:

```python
hero = sprite_sheet("assets/hero.bmp", 8, 8)
walk = sprite_animation(hero, [[0, 8], [1, 8]])
```

The BMP must contain at least two frames. The pairs mean `[picture number,
duration]`, not `[x, y]`. Picture numbers start at zero.

Start playback once with `play_animation(0, walk)`. Inside the loop, call
`update_animations()` and draw with `animated_sprite(0, player_x, player_y)`.
The pictures change, but the object stays in place unless your code also changes
its coordinates. See [sprite animation](animation.md) for a full explanation.

## Motion tables: read the next position

A motion table is like a list of stops on a route. Rather than calculating the
route during play, you decide the positions beforehand:

```python
path_x = constant_table([20, 30, 40, 30])
path_y = constant_table([40, 35, 40, 45])
```

Read matching entries to get each position:

| Step | X | Y | Position |
| --- | --- | --- | --- |
| 0 | 20 | 40 | `(20, 40)` |
| 1 | 30 | 35 | `(30, 35)` |
| 2 | 40 | 40 | `(40, 40)` |
| 3 | 30 | 45 | `(30, 45)` |

Your loop chooses a step, reads `path_x[step]` and `path_y[step]`, and draws
the object there. It decides how long to hold that step and when to advance.
`constant_table()` stores the numbers; it does not play an animation for you.
The path jumps between these positions unless you supply more positions or
write logic to calculate the positions between them.

Both tables must have matching lengths. For sprites, these coordinates are
pixels. A text marker uses text-tile coordinates instead. Try the
[complete, asset-free path example](constant-tables.md#use-a-list-as-an-animation-path)
to see the idea running before adding sprite artwork.

Useful applications include a bobbing collectible, a camera tour, a repeating
enemy route, or choreographed particles. Input-driven movement, changing targets,
and collision responses usually suit normal calculations better. You can mix
the approaches: for example, add a path's offsets to a moving object's position.

## What does a pose mean in Last Light?

A **pose** is one snapshot of an arrangement. In
[Last Light's motion module](../examples/last-light/includes/motion.pysn),
`pose_0` holds the first scene's sequence: 64 snapshots with 20 particles each.
That makes 1,280 entries. The name is an ordinary variable name, not a special
Pyson feature.

Each entry describes one particle's position and near/far appearance. This
example combines that information into one number to save cartridge space;
`-1` means hide the particle. It is an optional format chosen by the demo.
You can use separate, readable x/y tables in your own project.

The renderer selects a snapshot and reads its particle entries. Entry
`snapshot * 20 + particle` identifies one particle in one snapshot, with both
numbers starting at zero. Five particles update at a time, so a snapshot takes
four drawing updates to complete.

These are already projected screen positions. Last Light plays back prepared
perspective movement; it does not calculate that 3D projection during play.
[Oath of Stars](../examples/oath-of-stars/README.md) demonstrates the other
approach: it rotates and projects geometry while running.

## How would someone make a large sequence?

A short path can be written by hand. Thousands of packed positions should be
generated, not manually entered. Last Light's tables were made with an internal
authoring script. A person creating a similar sequence would:

1. Choose the effect and describe its movement, such as particles orbiting a ring.
2. Write an external script that calculates the positions for every snapshot.
3. Export those numbers as `.pysn` files containing `constant_table()` declarations.
4. Import the generated module and write a Pyson routine that reads and draws it.
5. Build, preview, and adjust the script until the movement looks right.

The authoring script could use ordinary Python and its math libraries. It runs
on the development computer, not on the Game Boy. The generated tables become
cartridge data; the drawing routine becomes code that runs during play.
Pyson does not automatically execute arbitrary scripts to generate tables.
Last Light already includes its generated output, so building it requires no
generator. The internal generator is not a public motion editor.

A visual tool could let someone draw paths, set key positions and timing,
preview the effect, and export those tables. **Pyson does not currently provide
that tool.** Understanding how tables are read does not mean you must be able
to create Last Light's choreography by hand.

## What are the tradeoffs?

Prepared positions use cartridge space to avoid repeating some calculations
during play. Each integer table entry uses two ROM bytes; the table's contents
use no working RAM. Step counters and other playback variables still use RAM,
and reading banked tables has overhead. Tables are not automatically faster
than a simple calculation such as `player_x += 1`.

They cannot change during play. Mutable positions, player state, and collision
results belong in ordinary variables or arrays. A table also does not bypass
graphics limits: too many visible sprites on a row can still disappear.

Start with normal movement and sprite animation. Add motion tables when a
prepared sequence solves a specific problem. For storage rules and limits,
read [ROM tables](constant-tables.md); for sprite limits, read
[graphics](graphics.md).
