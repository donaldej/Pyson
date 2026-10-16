# Pyson

Pyson combines Python-like syntax with Jison parsing to generate Game Boy
assembly, then assembles and links it into a playable ROM.

## AI development disclosure

Pyson was developed through active collaboration between the project owner and
OpenAI's ChatGPT and Codex coding agents. AI generated nearly all project-specific
implementation, alongside tests, documentation, and example content. The project
owner established the vision and requirements, challenged design and
implementation decisions, guided revisions, and tested example ROMs in emulators.

AI-generated code and content are a substantial part of this repository. This
disclosure does not imply that every line received human code review or that
correctness is guaranteed. Third-party dependencies, including Jison and RGBDS,
are independently developed projects.

## Windows setup

1. Install [64-bit Node.js](https://nodejs.org/) version 18 or newer, including npm.
2. [Download Pyson as a ZIP](https://github.com/donaldej/Pyson/archive/refs/heads/main.zip) and extract it, or clone it with Git:

   ```powershell
   git clone https://github.com/donaldej/Pyson.git
   ```

3. Open PowerShell in the extracted or cloned project folder (the folder containing
   `package.json`). If you just cloned it, run `cd Pyson`.
4. Install the dependencies, set up the assembler, and build Hello World:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run build -- examples/hello-world/main.pysn hello-world
```

Your ROM is `binary/hello-world.gb`. Open it in a Game Boy emulator when you
want to play it. Setup installs the pinned
RGBDS 1.0.4 tools locally and verifies the official download checksum. Jison
0.4.18 is installed from the npm lockfile. No administrator rights, PATH changes,
or PowerShell execution-policy changes are required.

**Only Node.js/npm and the automatically installed build tools are needed to
compile ROMs.** Docker, Python, PyBoy, BGB, FFmpeg, an editor extension, and a
C/C++ compiler are not required. Git is optional if you download the repository
as a ZIP. Pyson converts BMPs itself; the bundled `rgbgfx` utility is optional.

`npm.cmd run doctor` checks the required build tools. Optional testing and
recording tools do not make this check fail, even if an old Python environment
is present. Tests are a separate developer step: `npm.cmd run test:compiler`.

Setup reports existing dependency versions and locations before installing,
explains mismatches, and repairs project-local RGBDS tools without changing
system installations. See [installer checks](documentation/development.md#understanding-installer-checks).

For optional emulator tests, install 64-bit Python 3.10-3.13, then run:

```powershell
npm.cmd run setup:emulator
npm.cmd run test:emulator
```

`npm.cmd test` runs the full suite, skipping emulator cases if their environment
is absent. `test:emulator` requires that environment. See the
[Windows setup guide](documentation/development.md) for prerequisites, offline
RGBDS installation, troubleshooting, and all commands.

## Getting started

Start with the [tutorial learning path](tutorials/README.md) for explained,
runnable examples. Use the [grouped feature reference](documentation/README.md)
when you need exact API behavior and limits.

For AI coding agents, [AI_REFERENCE.md](AI_REFERENCE.md) is the self-contained
language/API manual, with exact signatures, limits, working examples, and common
pitfalls. [CONTEXT.MF](CONTEXT.MF) covers project workflow and development context.

## Feature documentation

- [Header configuration](documentation/header.md): every setting, option, default, and compatibility rule.
- [print](documentation/print.md): arguments, screen coordinates, text handling, and examples.
- [Variables and expressions](documentation/variables.md): integer rules, strings, operators, and assignments.
- [Fractional numbers](documentation/fixed-point.md): simple fractional movement, arithmetic, and limits.
- [Random numbers](documentation/random.md): seeded integer ranges and repeatable gameplay sequences.
- [Math and constants](documentation/math.md): numeric helpers and compile-time values.
- [Mutable terrain](documentation/mutable-maps.md): editable cells with synchronized artwork and collision.
- [Movement helpers](documentation/movement.md): pixel sweeps and wall sliding.
- [Diagnostics](documentation/diagnostics.md): runtime source context and linked build reports.
- [Build reports](documentation/build-reports.md): readable memory, tile, palette, and sprite budgets.
- [Profiling and rendering development notes](documentation/advanced-rendering-notes.md): measure frame work and refresh cadence without changing game code.
- [Feature Lab](documentation/feature-lab.md): the combined six-feature example.
- [Arrays and indexing](documentation/arrays.md): fixed-size integer lists, mutation, length, and iteration.
- [Constant tables](documentation/constant-tables.md): familiar list reads with immutable data stored in ROM.
- [Records](documentation/records.md): named fields, fixed record arrays, reference helpers, and RAM layouts.
- [Object pools](documentation/pools.md): spawning, safe handles, active iteration, and a shooter demo.
- [Dialogue](documentation/dialogue.md): word wrapping, typewriter text, multiple pages, and completion state.
- [Dialogue choices](documentation/choices.md): highlighted menus, cancellation, and branching conversations.
- [Conditionals and loops](documentation/control-flow.md): indentation, branching, ranges, and loop control.
- [Functions](documentation/functions.md): parameters, returns, local scope, and limits.
- [Named arguments](documentation/arguments.md): readable calls, optional defaults, and public built-in parameter names.
- [Modules](documentation/modules.md): imports, namespaces, shared state, and screen scaffolds.
- [Input and frame timing](documentation/input.md): buttons and interactive game loops.
- [Hardware frame timing](documentation/frame-timing.md): elapsed-time movement, animation, waits, and audio pacing.
- [Graphics](documentation/graphics.md): buffered drawing, palettes, and sprites.
- [Runtime tile fields and grids](documentation/tile-fields.md): draw changing arrays and live additive fields.
- [Animated backgrounds](documentation/background-clips.md): banked frame sheets with safe double-buffered uploads.
- [BMP assets](documentation/assets.md): automatic imports and conversion tools.
- [Nested tile maps and terrain](documentation/tilemaps.md): reusable tiles, static layouts, and gameplay properties.
- [Fixed HUD and window text](documentation/window.md): stationary status bars, dialogue panels, and window visibility.
- [ROM banking](documentation/banking.md): automatic asset/function placement and cartridge sizing.
- [Persistent saves](documentation/save.md): cartridge RAM slots, defaults, validation, and emulator persistence.
- [Sprite animations](documentation/animation.md): per-frame timing, loops, one-shots, playback state, and drawing helpers.
- [Background music](documentation/music.md): looping melodies, one-shots, pause/resume, and concurrent effects.
- [Sound effects](documentation/sound.md): built-in and custom effects, priorities, volume, and mute.
- [Scrolling worlds](documentation/scrolling.md): pixel cameras, world sprites, and a playable exploration demo.
- [Streaming worlds](documentation/worlds.md): larger banked maps, automatic tile loading, and 16-bit cameras.
- [Tile queries and collision](documentation/collision.md): static walls, pixel hitboxes against terrain, map dimensions, and tile queries.
- [Rectangle collision](documentation/rectangles.md): sprite hitboxes, overlap queries, and coordinate bounds.
- [Star Chase](documentation/star-chase.md): a playable game using the current language.

## Example projects

[Phase Heart](examples/phase-heart/README.md) builds moving interference fields
during playback, with interactive phase/lens controls and an original score.
It uses static tiles and numeric tables, with no background animation sheets.

[God in the Circuit](examples/god-in-the-circuit/README.md) is a two-minute
original DMG/Color audiovisual demo: mechanical iris, shaded inversion, moving
cathedral, eye, turning synthetic face and a Pyson signature. Prepared background
clips and live geometry follow an original industrial chiptune score.

[Prism Forge](examples/prism-forge/README.md) is an abstract DMG/Color music demo:
faceted geometry, folding ribbons, a luminous knot, an eclipse and a machine-mask
Pyson finale. Shared atlas tiles form full-screen animated layouts, accompanied
by live sprite geometry and an original electronic score.

Two larger examples combine several language features into playable games:
[Vault Run](examples/vault-run/README.md), an exploration puzzle with mutable
terrain and saved victories, and [Meteor Guard](examples/meteor-guard/README.md),
an arcade defense game with pooled actors, random waves, and a saved high score.

[Neon Requiem](examples/neon-requiem/README.md) is a noninteractive Game Boy
Color demo with four visual scenes and an original dark synthwave chiptune score.

[Void Engine](examples/void-engine/README.md) runs on both monochrome Game Boy
and Color: six scenes, banked streaming worlds, a projected particle torus,
a 40-sprite finale, and an original chiptune score in an MBC5 cartridge.

[Lucid Circuit](examples/lucid-circuit/README.md) is a dreamy Color demo with
four abstract worlds, cycling palettes, geometric particles, and an original
chiptune score. It uses double CPU speed and ROM-resident motion tables.

[Frame Timing](examples/frame-timing/README.md) demonstrates elapsed-time
movement and audio pacing. Hold A to add CPU work while maintaining travel time.

[Zero Signal](examples/zero-signal/README.md) is an original sci-fi music demo
for Game Boy and Color: an alien planet, a scrolling neon city, live perspective
stars in a wormhole, and a machine-core Pyson finale.

[Iron Litany](examples/iron-litany/README.md) is a grimdark machine ritual:
counter-rotating sigils, a live 3D cube, mutable-map interference, and a large
armored mask with animated crimson eyes. It supports Game Boy and Color.

[Star Squadron](examples/star-squadron/README.md) is a single-screen automatic
space battle using all 40 sprite components: a player, four enemies, twelve
bullets, and eight sparks, with a fixed HUD over a scrolling starfield.

```powershell
npm.cmd run build -- examples/header-print.pysn header-print
npm.cmd run build -- examples/hello-world/main.pysn hello-world
npm.cmd run build -- examples/button-counter.pysn button-counter
npm.cmd run build -- examples/color-sprites.pysn color-sprites
npm.cmd run build -- examples/array-inventory.pysn array-inventory
npm.cmd run build -- examples/fractional-motion/main.pysn fractional-motion
npm.cmd run build -- examples/record-fleet/main.pysn record-fleet
npm.cmd run build -- examples/pool-shooter/main.pysn pool-shooter
npm.cmd run build -- examples/collision-lab/main.pysn collision-lab
npm.cmd run build -- examples/random-gallery/main.pysn random-gallery
npm.cmd run build -- examples/feature-lab/main.pysn feature-lab
npm.cmd run build -- examples/vault-run/main.pysn vault-run
npm.cmd run build -- examples/meteor-guard/main.pysn meteor-guard
npm.cmd run build -- examples/neon-requiem/main.pysn neon-requiem
npm.cmd run build -- examples/void-engine/main.pysn void-engine
npm.cmd run build -- examples/last-light/main.pysn last-light
npm.cmd run build -- examples/oath-of-stars/main.pysn oath-of-stars
npm.cmd run build -- examples/cpu-speed/main.pysn cpu-speed
npm.cmd run build -- examples/runtime-diagnostics/main.pysn runtime-diagnostics
npm.cmd run build -- examples/dialogue-garden/main.pysn dialogue-garden
npm.cmd run build -- examples/sound-gallery/main.pysn sound-gallery
npm.cmd run build -- examples/music-gallery/main.pysn music-gallery
npm.cmd run build -- examples/banked-world/main.pysn banked-world
npm.cmd run build -- examples/banked-functions/main.pysn banked-functions
npm.cmd run build -- examples/save-counter/main.pysn save-counter
npm.cmd run build -- examples/animation-gallery/main.pysn animation-gallery
npm.cmd run build -- examples/streaming-world/main.pysn streaming-world
```

`build:asm` assembles an existing ASM file. Generated output goes into `build/`
and `binary/`; Git ignores those directories and local dependencies/tools.
Automated setup is currently supported on Windows x64.

## Compiler layout

- `jison/`: language grammar and lexer rules.
- `src/`: compiler implementation.
- `include/`: assembly runtime includes.
- `examples/`: example inputs and toolchain fixtures.
- `documentation/`: language feature references.
- `tests/`: parser, header, build, and optional emulator checks.
- `scripts/`: Windows setup, environment checks, builds, and asset utilities.
- `dev-tools/`: [optional MP4 recording tools](dev-tools/README.md); normal builds do not need them.

## Initial language

```python
header.title = "MY GAME"
header.target = "dmg"
header.version = 1
print("Hello World!", 4, 8)
print("Line one\nLine two", 0, 12)
```

Compile a `.pysn` file using `npm run build -- project.pysn output-name`.
This writes RGBDS assembly to `build/output-name.asm` and a ROM to
`binary/output-name.gb`. There are no external font assets to install.

Header assignments are compile-time configuration and must precede executable statements.
Duplicate and unknown settings are errors. Supported settings:

| Field | Values / default |
| --- | --- |
| `title` | Printable ASCII; default `"PYSON"`; max 16 characters for DMG, 15 for Color, 11 with manufacturer code |
| `target` | `"dmg"` (default), `"dual"` (DMG + Color), `"cgb"` (Color only) |
| `cpu_speed` | `"normal"` (default) or `"double"` on Color; requires dual/cgb, with normal-speed DMG fallback |
| `controller` | `"rom_only"` (small-game default; automatic MBC5 for larger assets), `"mbc1"`, `"mbc3"`, `"mbc5"` |
| `ram_kb` | External cartridge RAM: 0 (default; automatic 8 with save calls), 8, 32, 64, 128; limited by controller |
| `battery` | `False` (default; automatic `True` with save calls) or `True`; requires RAM or RTC |
| `rtc` | `False` (default) or `True`; requires MBC3 and battery |
| `rumble` | `False` (default) or `True`; requires MBC5 |
| `sgb` | `False` (default) or `True`; unavailable for Color-only games |
| `version` | Integer 0..255; default 0 |
| `licensee` | Two uppercase ASCII letters/digits; default `"00"`; old licensee byte generated as `$33` |
| `manufacturer` | Empty (default) or four uppercase letters/digits; Color targets only |
| `destination` | `"international"` (default) or `"japan"` |
| `rom_kb` | 0 (automatic, default), or 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192; limited by controller |

The entry point, logo, actual ROM size, and both checksums are generated.
Static graphics, map data, and user-defined functions are automatically banked.
Main, runtime routines, and small static definitions remain in bank 0.
Persistent saves use battery-backed cartridge RAM. RTC operations, rumble controls,
and SGB commands are not implemented yet. Save calls supply MBC5, 8 KB RAM, and a
battery flag when those settings are omitted.

`print(value, x, y)` takes string or integer expressions and integer tile coordinates:
`x=0..19`, `y=0..17`. Each character occupies 8x8 pixels. It writes over existing
text in statement order, clips at the right/bottom edge, and supports `\n` for
line breaks (next row, same starting x). Long lines do not wrap automatically.
An empty string does nothing. The original built-in font supports all 95
printable ASCII characters, including separate uppercase and lowercase glyphs.
Unsupported characters are compile errors. Both quote styles are supported;
escapes include `\n`, `\r`, `\t`, `\\`, `\'`, and `\"`, but tabs/carriage returns
cannot be displayed by the font. Text and graphics are buffered until `refresh_screen()`. Programs that reach their end
refresh the screen automatically once.
DMG and Color palette setup is included. Interrupts remain disabled unless the
optional hardware frame timing helpers enable the internal VBlank clock.

Variables, integer expressions, conditionals, while/for loops, loop control,
numeric functions, and button input are implemented. `print` accepts string
and numeric expressions and calculated coordinates. Header settings must precede
all executable statements, and header configuration remains literal-only.
See the feature references above for precise Python compatibility limits.

## Emulator verification

Runtime checks execute compiled ROMs in PyBoy, inspect working RAM and screen
maps, and simulate input on DMG and Game Boy Color. Setup instructions and
supported Python versions are in the [development guide](documentation/development.md).
`PYSON_EMULATOR_PYTHON` can select an existing environment. Tests generate their
fixtures and screenshots under `build/`; builds include debugger symbols.

Jison documentation: https://github.com/zaach/jison
RGBDS documentation: https://rgbds.gbdev.io/

## BMP graphics and color

```python
header.target = "dual"
hero = sprite_sheet("assets/hero.bmp", 16, 16)
sprite(0, hero, 0, 40, 60)
refresh_screen()
```

Paths resolve relative to the source file. Compilation converts BMPs into tiles,
frame maps, and palettes, and writes `build/output-name.assets.json` with asset
metadata. Use `tilemap("level.bmp")` and `draw_map(level, x, y)` for backgrounds.
See the [color demo](examples/color-sprites.pysn) for animation and palette changes.

Standalone export:

```sh
npm run convert:bmp -- examples/assets/hero.bmp build/hero sprite 16 16
```

Build the [scrolling world demo](examples/scrolling-world/main.pysn):

```powershell
npm.cmd run build -- examples/scrolling-world/main.pysn scrolling-world
```
