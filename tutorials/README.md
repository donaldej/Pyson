# Learn Pyson

Start with a working ROM, change one thing, rebuild, and observe the result.
These tutorials explain how existing examples work; each links directly to its
source, gives a build command, and includes an experiment with an expected result.
You do not need assembly knowledge.

Pyson is its own language, modeled as closely on Python's syntax and conventions
as practical for Game Boy development. It is not Python. Knowing Python syntax
can help you get started, but it is not a prerequisite.

If variables, conditions, loops, or functions are unfamiliar, the many beginner
Python tutorials available online can help you learn those basic concepts.
Then follow these lessons to see how they work in Pyson and game development.
Python tutorials teach useful foundations; they do not define which features
Pyson supports.

Pyson uses fixed-size storage and signed 16-bit integers. Ordinary Python
libraries and unlimited integers are not available. Learn these differences
as you encounter them rather than studying hardware registers first.

## Before starting

Use PowerShell at the repository root on Windows x64:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run doctor
```

Install a GB/GBC emulator and learn its button mappings. Build commands below
create `binary/<name>.gb`; open that file in the emulator. Run commands from the
repository root even when the source is inside an example folder. Asset paths
are relative to their declaring source file, not your shell directory.

[Windows setup](../documentation/development.md) covers prerequisites and the
optional automated emulator environment. You do not need that environment to
build ROMs and test them in your own emulator.

## Learning path

| Lesson | What you learn | Main example |
| --- | --- | --- |
| [1. Your first interactive program](01-first-program.md) | Build, text, state, buttons, and the loop | Hello World / Button Counter |
| [2. Sprites, palettes, and animation](02-sprites-animation.md) | Convert artwork and control animation | Color Sprites / Animation Gallery |
| [3. Screens and shared state](03-screens-modules.md) | Organize a complete game into modules | Star Chase |
| [4. Worlds, collision, and HUDs](04-worlds-collision.md) | Cameras, terrain, movement, editable maps | Scrolling World / Feature Lab |
| [5. Records and object pools](05-actors-pools.md) | Manage enemies and projectiles safely | Record Fleet / Pool Shooter |
| [6. Audio, conversations, and saves](06-game-systems.md) | Add player feedback and persistent progress | Music Gallery / Dialogue Garden / Save Counter |
| [7. Timing, streaming, and performance](07-performance.md) | Elapsed time, ROM data, banking, profiling | Frame Timing / Streaming World |
| [8. Study an advanced visual demo](08-visual-demos.md) | Understand how the pieces combine | Lucid Circuit / Void Engine |
| [9. Write readable calls](09-readable-calls.md) | Named parameters, skipped defaults, and expression order | Color Sprites |
| [10. Reusable text helpers](10-text-helpers.md) | String parameters, forwarding, and formatted text | Dialogue Garden |
| [11. Reusable array helpers](11-array-helpers.md) | Mutate caller arrays safely without copies | Array Inventory |
| [12. Fractional movement](12-fractional-movement.md) | Keep small movement steps and draw whole pixels | Fractional Motion |

Follow the order if you are new to game development. Experienced developers can
jump to a lesson, then use its reference links for exact API contracts.

The examples are independent projects, not successive revisions of one game.
Code excerpts in lessons are explained portions of those projects unless a
lesson explicitly calls them a complete program. Follow the linked source for
declarations and surrounding code; do not paste every excerpt into one file.

## Experiment safely

All example projects, including Void Engine, are intended for you to modify
and experiment with. If you want to keep the original for comparison, copy the
entire example folder so its asset/import paths stay together, and choose a
distinct output name. For single-file examples, preserve access to their assets
when copying them.

Some lessons are about timing differences. A display refresh, a game update, and
an animation/audio tick are not automatically the same thing. Lesson 7 explains
how to make elapsed-time behavior explicit.

[Feature reference](../documentation/README.md) gives the grouped API index.
[Project README](../README.md) describes the compiler and all build commands.
