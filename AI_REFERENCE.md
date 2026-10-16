# Pyson: reference manual for AI coding agents

Verified against this repository on 2026-10-15. This manual describes implemented
behavior, not a proposed language. Its purpose is to let an agent create and
maintain Pyson games without first scanning the compiler. Read this file for
language/API behavior and [CONTEXT.MF](CONTEXT.MF) for project history, development
conventions, user workflow, and repository navigation. Read any applicable agent
instructions before changing files. Neither document grants permission to edit,
publish, merge, or overwrite a user's work.

When implementation and this manual disagree, reproduce the issue, consult the
specific feature reference/source, and correct the discrepancy. Do not silently
invent a Python feature or hardware capability. Maintain this manual when APIs
change. The signature appendix is checked against the compiler and the complete
programs below are compiled by `tests/ai-reference.test.js`.

## Contents

1. [Operating contract and setup](#1-operating-contract-and-setup)
2. [Python compatibility and values](#2-python-compatibility-and-values)
3. [Functions, modules, and lifetime](#3-functions-modules-and-lifetime)
4. [Collections, records, and pools](#4-collections-records-and-pools)
5. [Input, game loops, and time](#5-input-game-loops-and-time)
6. [Graphics, palettes, and assets](#6-graphics-palettes-and-assets)
7. [Maps, cameras, collision, and movement](#7-maps-cameras-collision-and-movement)
8. [Animation, text, dialogue, and choices](#8-animation-text-dialogue-and-choices)
9. [Music and sound](#9-music-and-sound)
10. [Saves, headers, banking, and memory](#10-saves-headers-banking-and-memory)
11. [Diagnostics and verification](#11-diagnostics-and-verification)
12. [Complete tested programs](#12-complete-tested-programs)
13. [API signatures](#13-api-signatures)
14. [Implementation navigation and maintenance](#14-implementation-navigation-and-maintenance)

## 1. Operating contract and setup

Pyson is a compiled, Python-like language, **not Python**. `.pysn` source is
parsed with Jison, translated to RGBDS assembly, assembled, linked, and fixed
into a native Game Boy ROM. There is no Python interpreter, heap, standard
library, or package installer inside the ROM. Users should learn game design
concepts without having to learn assembly to use supported features.

The supported automatic setup targets Windows x64. Install x64 Node.js meeting
`package.json`'s requirement (currently 18+), with npm. At the repository root:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run build -- examples/hello-world/main.pysn hello-world
```

Use `npm.cmd` in PowerShell to avoid `npm.ps1` execution-policy issues. Setup
installs checksum-verified RGBDS 1.0.4 locally. Required executables are `rgbasm`,
`rgblink`, and `rgbfix`. Bundled `rgbgfx` is optional: BMP conversion is internal.
No Docker, Python, emulator, FFmpeg, editor extension, C/C++ compiler, admin
rights, or system PATH changes are needed to compile. Git is optional for ZIP
downloads. An emulator is needed to play/test a ROM interactively, not build it.

Setup reports installed versions, mismatches, missing tools, and unusable tools.
Repairs affect project-local RGBDS, not system installations. Jison's installed
version is compared with the exact lockfile version, not a semver range string.
`npm.cmd run doctor` checks required tools. Optional Python is checked only with
`npm.cmd run doctor -- --emulator`. See [Windows setup](documentation/development.md).

Optional automated emulation/profiling uses x64 Python 3.10-3.13 and pinned
packages in `tests/emulator-requirements.txt`:

```powershell
npm.cmd run setup:emulator
npm.cmd run test:emulator
```

`PYSON_SETUP_PYTHON` selects a base Python executable for optional setup;
`PYSON_EMULATOR_PYTHON` selects an already prepared interpreter for tests.
Legacy `GBPY_` aliases work; `PYSON_` takes precedence. No venv activation is
needed. BGB is an optional emulator; FFmpeg is optional for recording scripts.
Neither is installed or required by normal setup.

Build command: `npm.cmd run build -- path/to/main.pysn output-name`. Output names
contain letters, digits, underscores, or hyphens. Run at repository root.
Outputs: `binary/output-name.gb`; `build/output-name.asm`, `.o`, `.sym`,
`.report.txt`, `.report.json`, `.memory.json`, `.assets.json`, `.banks.json`,
`.music.json`, `.sounds.json`, `.animations.json`, `.save.json`.
`npm.cmd run build:asm -- path/to/file.asm name` assembles existing RGBDS source.
Generated outputs, installed tools, environments, and saves are Git-ignored.
Preserve personal saves and existing demos unless the user authorizes changes.

For a new game use `examples/my-game/main.pysn`, `assets/`, `includes/`, and
`screens/` as useful conventions, not required language structure. Include real
BMPs/JSON music so a clone builds without private generators. Keep user-facing
source readable; prepared geometry tables are optional techniques for advanced
effects, not prerequisites for normal games.

## 2. Python compatibility and values

- Use four-space indentation, `#` comments, colon-delimited blocks, and separate
  statements on separate lines. Tabs/inconsistent indentation are errors.
  Multiline lists and expressions inside parentheses are supported.
- `if/elif/else`, `while`, `for`, `break`, `continue`, `pass`, and top-level `def`
  are supported. No nested/conditional function definitions.
- `range(stop)`, `range(start, stop)`, `range(start, stop, step)` exclude stop.
  Bounds are integer expressions evaluated once; step is a nonzero signed
  integer literal. Empty loops do not initialize a previously unassigned counter.
  Reassigning the counter does not alter the range's internal progression.
- Use decimal integer literals; hexadecimal/binary, numeric separators,
  scientific notation, type annotations, f-strings, and general floats are absent.
- No classes, methods, closures, decorators, lambdas, first-class functions,
  comprehensions, generators, dictionaries, general tuples, slices, exception
  handling, `None`, Python packages, filesystem/network I/O, or dynamic allocation.
  Do not generate imports from Python's standard library.

Variables have fixed inferred types. Scalars use signed 16-bit integers
`-32768..32767`; arithmetic wraps. Booleans/comparisons are numeric 0/1.
Literals outside the supported range fail compilation. Names are case-sensitive;
built-in names cannot be redefined. Assign before use on every possible path.
Values assigned only inside a possibly empty loop or one `if` branch are not
definitely initialized. There is no dynamic type switching.

Operators: `+ - * // %`, unary `+ -`, `& | ^ ~`, comparisons
`== != < <= > >=`, and `not and or`. Supported precedence follows Python.
Comparison chains evaluate each operand once. `and/or` short circuit and return
an operand of the same fixed type. Numeric zero and empty strings are false.
`//` floors; `%` has the divisor's sign: `-7 // 3 == -3`, `-7 % 3 == 2`.
Integer `/`, powers, and shifts are unsupported. `abs(-32768)` wraps.
Augmented scalar/indexed integer assignments include `+= -= *= //= %= &= |= ^=`.
Division by literal zero fails compilation; dynamic zero stops with a diagnostic.

### Fractions

Decimals and `fixed(integer)` use signed Q12.4: two bytes, steps of 1/16,
range `-2048..2047.9375`. This is not general floating point. Literals round to
nearest step, ties away from zero; `0.1` becomes `0.125`. Multiplication/division
truncate sub-step results toward zero. Runtime overflow/conversions can wrap.

If a numeric variable receives a fixed value anywhere, it is fixed throughout
the program; use a separate `int(value)` variable for integer coordinates.
`int(-1.5) == -1`, while `-1.5 // 1 == -2`. `fixed(1) / 2` works; `1 / 2` does not.
Arithmetic and comparisons promote mixed operands to fixed when needed, which
also means the smaller fixed range applies. `+= -= *= /=` work with fixed values.
Drawing APIs, indices, ranges, saves, fields, and bitwise operators need integers.
Arrays/record fields/pool fields do not hold fixed values. For large worlds,
use integer positions plus small fractional accumulators or a nearby origin.

### Strings, constants, and math

Strings use single/double quotes; printable ASCII is supported, plus `\n`,
`\\`, `\'`, and `\"`. Parsed `\t`/`\r` cannot be rendered and are rejected in
display text. The font has 95 printable characters and preserves case.
Do not print Unicode. String variables reference ROM literals or the formatting
buffer. No string concatenation, indexing, comparison, mutation, or string returns.

`constant(value)` is a unique module-level, immutable compile-time integer or
boolean expression, including earlier constants, arithmetic, and bitwise
operations. It consumes no WRAM. Final results must fit signed 16-bit range.
`abs(value)`, `min(a,b)`, `max(a,b)`, `clamp(value,low,high)` support integers/fixed;
min/max are two-argument forms, not iterable/variadic Python versions. Reversed
clamp bounds return zero.

`random_seed(seed)` accepts signed integers, including zero. Initial seed is 1.
`randrange(stop)` or `randrange(start,stop)` excludes stop; `randint(low,high)`
includes both ends. No step/choice/random module. Empty literal ranges fail;
dynamic empty ranges return zero without advancing the generator. All modules
share one deterministic generator. A saved starting seed alone does not capture
its current position. Seed from input timing if session variation is desired.

## 3. Functions, modules, and lifetime

Functions accept numeric, string, integer-array/ROM-table, record, and pool-handle
parameters. They return only integers/fixed values. Bare return/fallthrough yields
zero, not `None`. Defaults are compile-time numeric/boolean expressions, not
strings or mutable objects. Required parameters precede defaults. Forward calls
are allowed, but both direct and indirect recursion are rejected.

Fixed-parameter built-ins and user functions accept positional/named arguments.
Positional arguments precede named ones. Names must match the public signature,
not an invented synonym. Duplicate/unknown/missing arguments fail. Explicit
expressions evaluate once, left-to-right in written order, even for reordered
keywords. Named arguments do not remove literal-only restrictions.

Function assignments create locals, even if a module name matches. Functions
may read initialized module values. To rebind their own module variable declare
`global name` before use/assignment; initialize that global at module scope.
Mutating an array element/record field does not rebind it and needs no `global`.
Local storage is statically allocated per function, not dynamically pushed and
freed each call. Repeated calls share those locations. Do not rely on unassigned
locals retaining old values. No automatic local-memory reuse is implemented.

Import forms: `import includes.state as state`, `import screens.game`,
`from includes.helpers import damage as hit`. Resolve all module names from the
**entry file's directory**, including imports written inside imported modules:
`includes.state` means `<entry-directory>/includes/state.pysn`. No `__init__.py`.
No wildcard/relative Python package imports or cyclic imports. BMP/music paths
instead resolve relative to the file declaring them.

Modules initialize once per module name; dependencies initialize before their
dependents/main. Namespaces keep same-named functions/variables separate.
`state.score += 1` writes shared state, not a duplicated screen allocation.
Repeated imports do not duplicate functions or RAM. Prefer shared-state modules
and finite `enter()/update()` screen routines coordinated by one main loop;
avoid infinite loops in imported modules' initialization.

An imported function's `global` may fall back to a main-owned global if its own
module lacks that name; prefer explicit `state.name` instead. Shared scratch
modules are possible but manual: assign every temporary before use, and never
reuse a slot whose value survives a nested helper. Avoid scratch in helpers unless
all callers and nested calls are known not to clash. Screen state is not freed
when a screen becomes inactive.

## 4. Collections, records, and pools

| Construct | Semantics and limits |
|---|---|
| `values = [1,2,3]` | Fixed-size mutable integer array, 0..1024 elements, 2 bytes each; must fit WRAM |
| `values[i]`, `values[-1]`, `len(values)` | Checked indexing; negative indices count from end |
| `for value in values` | Integer copy; assigning loop variable does not change source |
| `constant_table([1,2,3])` | Immutable module-level integer-expression table, up to 8191 words, banked ROM, zero element WRAM |
| `record(x=0,y=0)` | 1..32 fixed integer/boolean fields; 2 bytes each |
| `records(8,x=0,y=0)` | Literal count 1..1024 of the same record schema, bounded by WRAM |
| `[record(x=1),record(x=2)]` | Same-schema, fixed record array |
| `pool(16,x=0,y=0)` | Module-level fixed 1..128-slot pool, 1..32 literal-default integer/boolean fields |

No general nested lists: nesting is allowed only in specific declarations such
as tile maps, animation steps, sound/music, and record-array constructors.
No `.append()`, resizing, slicing, whole-array aliases/copies, or array returns.
Reinitializing an owning array requires the same length/type. RHS elements are
evaluated before overwriting destinations. Empty arrays are false, others true;
use `len(values)` in compound boolean expressions. Dynamic out-of-bounds access
stops the program; invalid owner-array literal indices fail compilation.

Array function parameters reference caller address/length and support different
lengths. Integer array elements can be updated without `global`. ROM tables can
be passed to read-only helpers; attempted writes, including through forwarding
helpers, fail. Array parameters cannot be rebound. A ROM read can cost more than
a RAM read; saving RAM does not imply faster execution.

Owning record assignment **copies fields**: `backup = player` is an independent
record, unlike a Python object alias. `items[i] = backup` copies the same schema.
Record parameters and record-array iteration variables instead reference original
storage. They cannot be rebound; mutate fields. Do not pass whole record arrays
or temporary record constructors as parameters. No record returns, nested
records, strings/arrays/fixed fields, or new runtime fields. `records()` initializer
expressions run once and their resulting defaults populate each element.

`spawn(pool, field=value, ...)` evaluates overrides in written order, takes the
lowest free slot, resets **all** fields to defaults, then applies overrides.
Returns a false empty handle if full. Check `if handle:` before uncertain field
access. Handle assignment aliases the same identity; stale handles never refer
to replacement objects. Invalid field access stops with `Invalid pool handle`.
`despawn(handle)` safely returns 1/0; `pool_index(handle)` is slot index or -1.
`pool_count(pool)` counts active slots; `len(pool)` is fixed capacity.
`reset_pool(pool)` clears active objects and invalidates handles. Pools are not
indexed directly or passed/returned wholesale; handles may be function arguments
but not returns or integer-array elements. A handle/parameter is tied to one pool.

`for shot in bullets:` visits active slots in ascending order; despawning the
current object is safe, reading it afterward is not. Newly spawned later slots
can be visited that pass. Pool slots cost `5 + 2*field_count` bytes each; handles
cost six bytes. Generation counters prevent stale reuse and retire a slot instead
of wrapping after 2^32-1 allocations. Pools are storage management, not automatic
sprite/collision systems: game code assigns sprite slots and handles interactions.

## 5. Input, game loops, and time

Screen: 160x144 pixels; text: 20x18 tiles. Hardware display rate is approximately
59.73 Hz. Game updates can be slower. Color double CPU speed does not change
display rate. Do not equate one loop iteration with one hardware frame.

- `read_buttons()` samples immediately and returns a held-button bitmask.
- `wait_vblank()` waits for a fresh frame and samples input.
- `button("a")` reads held state; `button_pressed("a")` reads the sampled rising
  edge. Reading it does not consume it. Names must be literal strings,
  case-insensitive: right, left, up, down, a, b, select, start.
- Masks: `BUTTON_RIGHT=1`, LEFT=2, UP=4, DOWN=8, A=16, B=32, SELECT=64, START=128.
- Poll once per update: a second sample can erase pressed edges. Input is also
  sampled at startup. `refresh_screen()` does **not** sample buttons.
- `refresh_screen()` commits queued drawing and can wait for display time.
  Calling both `wait_vblank()` and refresh can cost extra frames. A good normal
  loop is sample with `read_buttons()`, update state, queue drawing, refresh.
- `frame_count()` enables a hardware clock and returns 0..32767, wrapping.
  `elapsed_frames(previous)` handles wrap; advance the timestamp by that returned
  delta, not a second read. Delta can be zero or greater than one. Compare times
  less than 32768 frames apart. `wait_frames(count)` waits additional frames and
  samples input, without drawing. Negative dynamic arguments return zero/no-op.

With the clock enabled, audio accounts for elapsed frames when serviced.
Animation still needs explicit `update_animations(min(delta,255))`. Dialogue
speed counts calls to its update function. Bulk loads can disable the LCD,
pausing the clock; it measures active display frames, not wall-clock time.
Audio is cooperative, not interrupt-driven: long calculations delay audible
changes even if subsequent servicing catches the timeline up. Refresh/yield
regularly. Break expensive work into bounded batches. For collision-sensitive
simulation, use small steps or sweep movement rather than large delta jumps.

## 6. Graphics, palettes, and assets

Declare imports at module top level using literal paths/dimensions:
`sprite_sheet("assets/hero.bmp",16,16)`, `tilemap("assets/room.bmp")`,
`worldmap("assets/world.bmp")`, or `tile("assets/wall.bmp",solid=True,terrain=1)`.
For an atlas, `tile("assets/tiles.bmp", x=2, y=1)` selects one 8x8 tile;
coordinates are literal tile indices 0..31, inside the image. Atlas selections
share one palette for the source BMP; only selected patterns become resident.
No external generator or `rgbgfx` call is needed. Runtime loops remain runtime
assembly; the compiler does not generally execute drawing loops at compile time.

BMPs: uncompressed Windows 1/4/8/24/32-bit, dimensions divisible by eight;
top-down images supported. Sprite frame size defaults 8x8; chosen dimensions
must divide the sheet. Frames number left-to-right then top-to-bottom, max 255.
Each frame may use at most 40 components, subject to free consecutive slots.
Background `tilemap` BMPs max 256x256; streamed `worldmap` BMPs max 1024x1024.
PNG/JPEG/animated image imports are not implemented.

Each BMP has four palette entries: backgrounds use four opaque colors; sprites
use three opaque colors plus transparency. Extra colors are deterministically
quantized. Colors use five bits per RGB channel. Opaque colors are sorted light
to dark for fallback, so use known grayscale artwork and inspect import metadata
before assigning a custom palette. Do not assume a particular RGB color is
universally transparent: meaningful 32-bit alpha below 128 is transparent;
otherwise the top-left pixel's color is the key across the entire sprite sheet.
Keep that corner blank. An all-zero alpha channel is treated as no alpha.
Transparent background pixels become white, not transparent holes in the map.

Tile patterns are 8x8, 16 bytes each; identical patterns are deduplicated.
The current resident pool is 256 patterns, including 95 font entries, leaving
up to 161 additional unique resident patterns. Sprite sheets, text, and ordinary
maps share it. Streamed worlds use remaining cache slots. Total dictionary size
and simultaneous local working-set size are different. A large repeated BMP
can be cheaper than many small unique assets.

Imported sprite palettes use indices 0..7; background imports use 1..7; background
slot 0 remains available for text. Repeated same-file/kind/dimension imports share
handles. On Color, BMP imports supply their colors automatically; palette setters
are optional overrides. Slots are assigned during compilation; inspect `.assets.json` instead
of guessing, particularly when modules import assets. Nested maps retain each
tile's palette. `bg_palette`/`sprite_palette` replace slots at runtime, so screen
entry routines can install their own colors. Index and color arguments must be
literals; colors are `"#RRGGBB"` or RGB15 integer values 0..32767. Sprite color
zero is transparent. Colors are visible only on dual/cgb hardware; DMG uses
grayscale fallback. There is no runtime palette object or named palette preset API.

`sprite(slot,sheet,frame,x,y,flip_x=False,flip_y=False)` uses screen pixel
top-left coordinates and **consecutive** 8x8 hardware components. 16x16 consumes
4 slots; 32x32 consumes 16. There are 40 slots total, 0..39, and ten components
per horizontal scanline. Different palettes do not increase those limits.
Overlapping slot ranges overwrite each other. Flips apply to the whole frame.
`hide_sprite(base_slot)` hides that complete previously drawn frame.
World variants subtract the current camera. Invalid dynamic arguments/capacity
draw nothing; edges clip. A hidden enemy/pool despawn does not automatically hide
its old sprite: manage that explicitly. Backgrounds/window text consume no slots.

`print(value,x,y,palette=0)` draws a string/integer on the background at tile
coordinates, x=0..19/y=0..17. Convert fixed values with `int()`. Text does not
automatically erase old longer values: clear the field or pad with spaces.
Newlines return to the original starting column on the next row. Text clips at
right/bottom edges; ordinary print does not wrap or scroll automatically.
`clear_screen(palette=0)` clears background, not sprite objects. Queue graphics,
then refresh. No current `present()` API: the canonical name is `refresh_screen()`.

### Runtime grids and additive fields

`draw_tile_grid(cells,columns,x=0,y=0)` draws a flat integer array of tile()
handles, row-major; width 1..32, partial last rows allowed. Invalid entries skip
their cells. `draw_tile_field(columns,rows,tiles,x=0,y=0)` draws each cell using
`tiles[(columns[x]+rows[y]) % len(tiles)]`. The tile list must have a power-of-two
length 2..64; invalid entries draw blank tile/palette 0. Axes use at most 32
elements each. Both accept RAM arrays, ROM integer tables and helper parameters;
starting coordinates are tile x=0..19/y=0..17 and output clips to screen. Empty
inputs draw nothing. Invalid dynamic configurations draw nothing, invalid
literals are compile errors. Inputs are not modified; collision/terrain is not
updated. Use refresh_screen() to display the result. These use resident tile
patterns, not background-clip uploads. See [runtime tile fields](documentation/tile-fields.md)
and [Phase Heart](examples/phase-heart/README.md).

### Prepared animated backgrounds

`background_clip("assets/intro.bmp",160,128)` imports a grid of 1..255 equal
frames, left-to-right then top-to-bottom. Frame dimensions are multiples of 8,
at most 160x144; the sheet fits 1024x1024. `draw_background(clip,frame,x=0,y=0)`
queues a frame at tile coordinates. `refresh_screen()` commits it. Two reserved
VRAM buffers keep uploads off the displayed picture; the frame clock is enabled
automatically. Budget: resident patterns + 2 * largest frame pattern count <=256.
All clips share those buffers; there is one clip layer. Movement/resizing clears
old dynamic cells to blank palette 0; static text/maps are preserved elsewhere.
A second call before refresh first commits the pending frame. Clips cannot
currently coexist with world cameras, streaming, or fixed window/HUD routines.
Uploads service cooperative audio but may take multiple display frames; do not
promise 60 picture updates per second. The compiler does not simplify tile
patterns. See [background clips](documentation/background-clips.md) and the
[God in the Circuit example](examples/god-in-the-circuit/README.md).

## 7. Maps, cameras, collision, and movement

`tilemap([[wall,floor], [floor,wall]])` is a compile-time rectangular nested list
of previously declared `tile()` names, not a general runtime list. Max 32x32 tiles.
`tile` requires an 8x8 BMP; `solid` defaults False and `terrain` defaults 0 (0..255).
These two options use keywords. `draw_map(map,x,y)` draws at tile coordinates and
clips to the visible map area; it does not implement a scrolling camera itself.

`draw_world(map)` selects/loads a background for scrolling. `set_camera(x,y)`
queues pixel coordinates clamped to map bounds. Usually load on scene entry,
then update the camera without reloading the world every frame. `camera_x/y()`
read queued positions. `world_sprite`/`world_animated_sprite` accept world pixel
positions. A map smaller than the screen has max camera zero. Sprite collision
does not happen automatically as the camera moves.

`worldmap(source,collision=None)` accepts a BMP, optionally with keyword
`collision=["###", "#.#", "###"]` rows exactly matching its tile dimensions;
`#` is solid, `.` walkable. It also accepts nested `tile()` rows with their own
properties. Compiler-prepared overlapping regions support cameras up to the
1024x1024-pixel world limit. Fonts/sprites/ordinary maps stay resident; streamed
world-only tiles need not. Local tile variety and conflicts between neighboring
regions must fit remaining slots, otherwise compilation fails. Do not simply
increase cartridge ROM size to fix a VRAM working-set failure.

`mutable_map(rows)` makes a RAM-backed nested tile map, max 32x32. It costs three
bytes per cell plus a handle. `set_map_tile(map,x,y,tile)` changes one cell and
returns 1 on success, 0 if invalid. `reset_map(map)` restores original cells.
Explicitly redraw after editing; updates do not automatically appear. For a
selected mutable world, `draw_world(map)` redraws while retaining its camera.
Mutable BMP worlds are not implemented. Copying a map handle refers to the same
map, not an independent copy. Do not allocate huge mutable boards casually.

`collision_map(["###", "#.#", "###"])` supplies separate static collision data
without graphical tiles; it is not a drawable background.

| Query | Coordinates and result |
|---|---|
| `map_width/height(map)` | Dimensions in tiles; invalid handle returns -1 |
| `tile_at(map,x,y)` | Tile coordinates; ID or -1 outside; world IDs are stable local IDs, not current VRAM slots |
| `tile_is_solid(map,x,y)` | Tile coordinates; 1 for solid/invalid/outside, otherwise 0 |
| `tile_terrain(map,x,y)` | Tile coordinates; terrain label or -1 for outside/unsupported; BMP worlds return 0 |
| `rect_is_solid(map,x,y,width,height)` | Pixel hitbox against terrain; invalid/blocked returns solid |
| `rect_overlap(ax,ay,aw,ah,bx,by,bw,bh)` | Pixel rectangles in the same coordinate space; touching edges do not overlap; nonpositive sizes return 0 |
| `move_x(board,x,y,width,height,delta)` | Return new X after one-pixel swept tests; assign the result |
| `move_y(board,x,y,width,height,delta)` | Return new Y after one-pixel swept tests; assign the result |

Movement helpers do not mutate your variables or apply gravity/enemy collisions.
Resolve X then Y to slide along walls. A blocked initial hitbox stays put. Sweep
cost grows with displacement. Collision map coordinates are map-relative: subtract
the on-screen tile drawing origin before querying a small board placed in a HUD.
Graphics visibility and hitboxes are independent; handle actor damage yourself.

## 8. Animation, text, dialogue, and choices

`sprite_animation(sheet,[[frame,ticks],...],loop=True)` is a top-level static
definition with 1..64 steps, durations 1..255. `play_animation(slot,definition,
restart=False)` assigns playback to a base sprite slot. Re-selecting the same
animation preserves state unless restarted. `update_animations(ticks=1)` advances
explicitly, max 255 ticks per call. Draw via `animated_sprite(slot,x,y,...)` or
`world_animated_sprite`. Queries report `animation_frame`, `animation_finished`,
`animation_playing`; controls `restart_animation`, `stop_animation`. Stopping
playback and hiding a sprite are separate operations. Do not copy/alias/pass
animation definitions; share through modules and pass numeric playback slots.
One-shots hold their final frame and report finished after its full duration;
selecting that same definition again does not restart it. Explicitly restart.

The window is an opaque overlay extending from its origin to the right/bottom
screen edges. It has no height or transparency setting. `window_position(0,136)`
gives one bottom HUD row; `(0,128)` gives two; `(0,0)` covers the whole background.
Position arguments are screen pixels x=0..159/y=0..143. `print_window` uses local
tile coordinates, same font and palette rules as print. `clear_window` preserves
position/visibility. It starts hidden; `show_window` and `hide_window` are explicit.

`format_text("HP {} / {}",hp,max_hp)` supports up to four integer substitutions,
literal template and `{}` placeholders, escaped `{{`/`}}`, max 255 glyphs.
No f-strings. It returns a reference to **one shared temporary buffer**. Another
format call overwrites aliases; consume before formatting again, and do not pass
two independently formatted values to one call expecting snapshots.

`start_dialogue(text,speed=2,palette=0)` opens a bottom 48-pixel window, wraps
four lines of 18 characters, paginates, and reveals text as `update_dialogue()`
is called. Speed 0 reveals immediately, 1..255 counts updates per character.
Update after one input sample; refresh to display. A/Start reveals or advances;
opening presses are ignored, held input does not skip pages. `dialogue_finished()`
means final confirmation, not merely all characters revealed, and remains true
until replaced/closed. Apply completion effects once using a state transition.
`close_dialogue()` cancels. Queries: active, waiting, finished.

Immediately after starting text and before its first update, optionally set
`dialogue_speaker("NAME")` (literal 1..14 chars) and
`dialogue_portrait(sheet,frame=0,palette=0)` (16x16 frame, **background** palette).
Portraits use background tiles, not sprite slots, and reduce available text width.
Dialogue snapshots formatted text so later HUD formatting cannot replace it.

`start_choices(["PLAY","QUIT"],palette=0,selected_palette=0,default=0,cancel=True)`
uses the same window. Literal list of 1..4 literal, nonblank, single-line strings,
each 1..16 chars. Up/Down wrap; A/Start confirms; B cancels if allowed. Use the same
`update_dialogue()` routine. `choices_selected()` is the current/last index;
`choices_result()` is confirmed index or -1; active/finished/cancelled are queries.
Results persist until replaced/closed. Speaker/portrait are not supported in choices.
Dialogue/choices replace the HUD; closing does not restore it. Redraw HUD on exit.

## 9. Music and sound

Two music voices can play together: pulse `voice=0` on hardware channel 1, wave
`voice=1` on channel 3. One effect sequence uses pulse channel 2 or noise channel
4. Do not describe wave music as unimplemented or promise two simultaneous effect
sequences: the effect player has one active sequence and priority arbitration.

`music_track(notes,loop=True,duty=2,voice=0,instrument="triangle")` is a top-level
literal definition, 1..255 notes. Each `[frequency_hz,duration_ticks,volume]` uses
frequency 0 (rest) or 64..20000, duration 1..255, volume 0..15. Duty 0..3 is pulse
duty; do not explicitly supply a wave instrument for voice 0. Voice 1 supports
triangle/sine/square/saw or 32 literal samples 0..15. Wave volume is quantized:
0 silent, 1..3 quarter, 4..7 half, 8..15 full.

`music_file("assets/theme.json",part=0)` imports one JSON track object or a
selected part of `{"parts":[{"notes":[[440,24,8]],"voice":0}, ...]}`. Optional
track fields match inline options. Declare/play each part separately. This is
not MIDI/tracker/WAV/MP3 import. `play_music(track,restart=False)` replaces that
voice only; repeating the same active/paused track preserves it unless restarted.
Pause/resume/stop affect both voices; `music_playing()` means either advancing.
Parts of different lengths loop independently, without automatic bar alignment.

Built-in literal effect names and priorities: menu_move=1, menu_confirm=2,
collect=3, damage=4, lose=5, win=6. `play_sound("collect")` includes only referenced
effect data. Custom `sound_effect(channel,steps,priority=3,duty=2)` is top-level,
1..64 steps of `[pitch,duration,volume]`. Pulse uses Hz 0 or 64..20000; noise uses
parameter 0..223, where 0 is noise (use volume 0 for a noise rest). Durations
1..255, volume 0..15; omit duty for noise. Priority is 0..7. `play_sound(effect,
priority=...)` can override it. Equal/higher replaces/restarts; lower is ignored.
There is no queue. Literal names/definition references are required, not a
runtime string chosen from a list.

`set_sound_volume(left,right)` takes 0..7, initial 7/7. Hardware level zero is
not guaranteed silence. `mute_sound(True)` stops and silences effects **and**
music; unmuting does not restart them. `stop_sound()` and `sound_playing()` affect
effects only. Audio commands are immediate, not deferred to refresh. Yield or
service audio regularly as explained in timing; no interrupt audio mixer exists.
Declared but unplayed definitions retain binding storage but emit no sequence.
References inside compiled functions count even if never executed. Main/runtime,
music and effect sequences occupy bank 0, so a large cartridge does not eliminate
the fixed-bank limit. Static sound/music bindings cannot be copied or passed as
ordinary parameters; select through module-qualified names and branches.

## 10. Saves, headers, banking, and memory

`save_read(slot,default=0)`, `save_write(slot,value)`, `save_exists(slot)`,
`save_delete(slot)`, `save_clear()`, `save_capacity()` store signed integer values.
Writes are immediate and verified; they return 1/0. Missing/damaged records read
as the default. Invalid literal slots fail compilation; dynamic invalid slots
return default/false without writes. `save_clear` is synchronous, not a per-frame
operation. No buffered save commit or direct array/string serialization API.

Save calls automatically supply MBC5, 8 KiB cartridge RAM, battery when omitted
(MBC3 when RTC requested). Explicit incompatible header values fail. Each value
uses an eight-byte checked record: 8/32/64/128 KiB RAM provide 1024/4096/8192/16384
slots. Save APIs own that configured RAM; it is not extra ordinary variable RAM.
Preserve `.sav` files and test on fresh in-memory/temporary saves when possible.

### Header settings

Assign each at most once at module top level before executable assignments,
imports that initialize state, or loops. Use literals, not runtime variables.
Put configuration first in the entry file. Function definitions do not count as
executable assignments. Derived logo, entry jump, checksums, capacity bytes, and
cartridge-type byte are automatic.

| Setting | Values | Default |
|---|---|---|
| `header.title` | Printable ASCII, nonempty; DMG max 16, dual/cgb max 15, max 11 with manufacturer | `"PYSON"` |
| `header.target` | `"dmg"`, `"dual"`, `"cgb"` | `"dmg"` |
| `header.cpu_speed` | `"normal"`, `"double"`; double needs dual/cgb and only applies on Color | `"normal"` |
| `header.controller` | `"rom_only"`, `"mbc1"`, `"mbc3"`, `"mbc5"` | Small unsaved games rom_only; larger games auto MBC5 |
| `header.rom_kb` | 0 (auto), 32,64,128,256,512,1024,2048,4096,8192, controller-limited | 0 |
| `header.ram_kb` | 0,8,32,64,128, controller-limited | 0; saves supply 8 |
| `header.battery` | True/False, requires RAM or RTC | False; saves supply True |
| `header.rtc` | True/False; MBC3 with battery | False |
| `header.rumble` | True/False; MBC5 | False |
| `header.sgb` | True/False; unavailable with cgb-only target | False |
| `header.version` | 0..255 | 0 |
| `header.licensee` | Two uppercase ASCII letters/digits | `"00"` |
| `header.manufacturer` | Empty or four uppercase ASCII letters/digits; Color target required | `""` |
| `header.destination` | `"international"`, `"japan"` | `"international"` |

ROM-only: max 32 KiB, no RAM/battery/RTC/rumble. MBC1/MBC3: max 2048 KiB ROM,
0/8/32 KiB RAM. MBC5: max 8192 KiB ROM, 0/8/32/64/128 KiB RAM; rumble limits RAM
to 64. MBC1 ROM >=1024 KiB permits at most 8 KiB RAM. Battery without RAM requires
MBC3 RTC. Header RTC/rumble/SGB flags are metadata declarations: clock access,
motor control, and SGB command APIs are **not implemented**.

Graphics, maps, ROM tables and user functions bank automatically; callers' banks
are restored without user assembly. Each placed object/function must fit one
16 KiB bank; a ROM integer table therefore holds at most 8191 words. Increasing
ROM size does not enlarge a bank or WRAM. Main, runtime and audio sequences stay
in fixed bank 0; bank overflow there can require reducing code/data in that bank.
Do not promise arbitrary large functions or unlimited music.

User allocations share 4096 bytes of WRAM0 with runtime buffers and compiler
temporaries; the stack uses WRAMX separately. Scalar/string references use two
bytes; array elements two each; array parameters four; record references two;
pool handles six. Inactive scenes, function locals, unused array elements and
inactive pool slots remain allocated. There is no heap, garbage collector, or
automatic screen/local lifetime overlay. RAM budgets depend on enabled features:
scrolling/window/dialogue/formatting/pools all add state or buffers. Check the
linked report rather than assuming 4 KiB is free for user variables.

## 11. Diagnostics and verification

Every CLI build emits `.report.txt` for humans and `.report.json` for agents.
Read RAM used/free, ROM size/banks, variable addresses/layouts, and source file,
line, scope, bank/address mappings. Graphics summary separates map positions,
unique patterns, resident shared tiles, streaming slot allocation/local peak,
imported palette counts, and sprite cost **per frame drawn**. Do not sum asset
counts as if patterns cannot be shared. Reports do not prove runtime scanline
budgets, instance counts, speed, or stack depth. See [build reports](documentation/build-reports.md).

Compiler diagnostics show source text and known hints. Fix the first failure,
including imported file errors. Bounds, division-by-zero, and invalid pool
handle failures stop visibly; instrumented operations can show source basename
and line. Full paths are in the JSON. Invalid-handle tile queries intentionally
return sentinels instead; not every invalid value is a runtime exception.

RGBDS `.sym` and source/variable mappings can assist emulator debugging. There
is **no implemented Pyson debugger launcher, source stepping, watch UI,
`breakpoint()`, `assert`, or remote debugger adapter**. These have been discussed,
not shipped. BGB remains optional and must not become a build prerequisite.

`npm.cmd run test:compiler` checks compiler/toolchain/report behavior without
Python. `npm.cmd test` includes runtime cases, skipped when their environment is
absent. `npm.cmd run test:emulator` explicitly requires and runs emulator tests.
Use the smallest relevant suite first, then required regression checks. Runtime
tests use PyBoy; passing them is not certification on every physical cartridge.

Optional profiling: `npm.cmd run profile -- examples/frame-timing/main.pysn
--target dmg --frames 600` (one shell command). It measures work/wait/idle,
refresh cadence and source visits with PyBoy without adding guest instructions.
Use measurements before optimizing. New features should include readable docs,
complete examples, and checks appropriate to their risk. Don't rewrite a protected
or accepted demo just to demonstrate a small unrelated change.

### Frequent repairs

| Symptom | Check before changing the compiler |
|---|---|
| Button press missing | Sample once per iteration; refresh does not poll; don't sample again after wait_vblank |
| Movement/audio slow | Loop work vs hardware frames; yield; use elapsed frames and bounded batches |
| Sprite missing | Base-slot range, frame number, hide calls, camera space, 10-component scanline cap |
| Gray rectangle around sprite | BMP transparency key/alpha; top-left pixel must be the intended blank |
| Wrong colors | Actual imported palette slot/order, quantization, dual/cgb target |
| Old digits remain | Clear/pad the field before printing a shorter value |
| HUD hides background | Window covers everything below/right of its origin, even blank cells |
| Format text unexpectedly changes | Shared format buffer alias; consume before another format call |
| Full-map flash/stutter | Avoid reloading every update; use camera or redraw only on edits |
| Huge RAM use | Static locals/arrays, mutable map cells, window/scrolling buffers, formatting snapshots |
| Large ROM still overflows | Per-object 16 KiB limits and fixed bank 0; inspect bank report |
| Nested call corrupts scratch | Shared scratch overwritten; give helper its own local storage |
| Import duplicates/scope confusion | Entry-root module resolution, module namespace, field mutation vs rebinding |

## 12. Complete tested programs

Each plain fenced `pyson` block in this manual is a **complete independent program**.
Blocks marked `pyson file=...` together form the multi-file program G.
Tests compile and assemble these programs. They do not run infinite game loops.
Other inline signatures/expressions are fragments, not standalone projects.
Asset paths below are real repository assets and resolve with an entry file
located in `examples/`, as used by the test harness. For a new directory copy
the relevant BMPs into its `assets/` and change paths accordingly.

### A. Text, input, elapsed time, and named arguments

```pyson
header.title = "MANUAL COUNTER"
count = 0
previous = frame_count()
age = 0
while True:
    read_buttons()
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    age = (age + delta) & 32767
    if button_pressed("a"):
        count += 1
    if button_pressed("b"):
        count = 0
    print("A COUNT / B RESET", x=0, y=0)
    print("       ", 0, 2)
    print(value=count, x=0, y=2)
    print("ACTIVE FRAMES", 0, 4)
    print("       ", 0, 5)
    print(age, 0, 5)
    refresh_screen()
```

### B. A scrolling world, sprite, and fractional movement

```pyson
header.title = "MANUAL SHIP"
header.target = "dual"
sky = worldmap("star-squadron/assets/stars.bmp")
hero = sprite_sheet("star-squadron/assets/player.bmp", 16, 16)
x = fixed(72)
scroll = 0
previous = frame_count()
draw_world(sky)
while True:
    read_buttons()
    elapsed = elapsed_frames(previous)
    previous = (previous + elapsed) & 32767
    delta = min(elapsed, 8)
    if button("left"):
        x -= fixed(delta) * 0.5
    if button("right"):
        x += fixed(delta) * 0.5
    x = clamp(x, 0, 144)
    scroll = (scroll + delta) % 256
    set_camera(0, scroll)
    sprite(slot=0, sheet=hero, frame=scroll // 8 & 1, x=int(x), y=104)
    refresh_screen()
```

This example deliberately caps simulation movement after a stall, while keeping
its saved hardware timestamp accurate using the raw elapsed count.

### C. Mutable terrain, collision, records, and pools

```pyson
header.title = "MANUAL TERRAIN"
header.target = "dual"
wall = tile("iron-litany/assets/shade-0.bmp", solid=True, terrain=1)
floor = tile("iron-litany/assets/shade-1.bmp", terrain=0)
board = mutable_map([
    [wall,wall,wall,wall,wall],
    [wall,floor,floor,floor,wall],
    [wall,floor,wall,floor,wall],
    [wall,floor,floor,floor,wall],
    [wall,wall,wall,wall,wall],
])
marker = sprite_sheet("star-squadron/assets/beams.bmp")
player = record(x=8, y=8)
particles = pool(4, x=0, y=0, life=0)
draw_map(board, 0, 0)
print("MOVE / A FIRE", 0, 6)
print("B OPENS CENTER", 0, 7)
while True:
    read_buttons()
    dx = 0
    dy = 0
    if button("right"):
        dx = 1
    elif button("left"):
        dx = -1
    if button("down"):
        dy = 1
    elif button("up"):
        dy = -1
    player.x = move_x(board, player.x, player.y, 8, 8, dx)
    player.y = move_y(board, player.x, player.y, 8, 8, dy)
    if button_pressed("b"):
        set_map_tile(board, 2, 2, floor)
        draw_map(board, 0, 0)
    if button_pressed("a"):
        shot = spawn(particles, x=player.x, y=player.y, life=20)
    for slot in range(4, 8):
        hide_sprite(slot)
    for particle in particles:
        particle.life -= 1
        if particle.life <= 0:
            despawn(particle)
        else:
            particle.y -= 1
            sprite(4 + pool_index(particle), marker, 1, particle.x, particle.y)
    sprite(0, marker, 0, player.x, player.y)
    refresh_screen()
```

### D. Integer and ROM-array helpers, record copies, and saves

```pyson
header.title = "MANUAL STATE"
LIMIT = constant(3)
defaults = constant_table([3, 2, 1])
health = [0, 0, 0]
pilot = record(x=10, hp=3)
backup = pilot
backup.hp = 1
def copy_values(target, source):
    for i in range(min(len(target), len(source))):
        target[i] = source[i]
def damage(who, amount=1):
    who.hp = max(0, who.hp - amount)
copy_values(health, defaults)
damage(pilot)
high = save_read(slot=0, default=0)
if pilot.hp > high:
    save_write(slot=0, value=pilot.hp)
print(format_text("HP {} COPY {}", pilot.hp, backup.hp), 0, 0)
print(health[LIMIT - 1], 0, 1)
refresh_screen()
```

### E. Two-voice music, effect, dialogue, and a choice state machine

```pyson
header.title = "MANUAL DIALOG"
header.target = "dual"
lead = music_track([[440,24,8],[523,24,8]], voice=0)
bass = music_track([[110,48,8]], voice=1, instrument="sine")
play_music(lead)
play_music(bass)
start_dialogue("Welcome. Press A to continue.", speed=2)
mode = 0
previous = frame_count()
while True:
    read_buttons()
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    update_dialogue()
    if mode == 0 and dialogue_finished():
        start_choices(["REPLAY", "REST"], default=0)
        mode = 1
    elif mode == 1 and choices_finished():
        if choices_result() == 0:
            play_sound("menu_confirm")
            start_dialogue("The loop continues.")
            mode = 0
        else:
            stop_music()
            mode = 2
    elif mode == 1 and choices_cancelled():
        start_dialogue("Cancelled. Try again.")
        mode = 0
    refresh_screen()
```

### F. Independent animation and a bottom HUD

```pyson
header.title = "MANUAL ANIM"
header.target = "dual"
hero = sprite_sheet("star-squadron/assets/player.bmp", 16, 16)
engine = sprite_animation(hero, [[0,8],[1,8]], loop=True)
clear_window()
window_position(0, 136)
print_window("A RESTARTS", 0, 0)
show_window()
play_animation(0, engine)
previous = frame_count()
while True:
    read_buttons()
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    if button_pressed("a"):
        restart_animation(0)
    update_animations(min(delta,255))
    animated_sprite(0, 72, 64)
    refresh_screen()
```

### G. A complete multi-file shared-state project

Save these three files under the same entry directory. Build its `main.pysn`.
Both importers refer to one `state.score`; calling `update()` yields score 1.

```pyson file=includes/state.pysn
score = 0
def reset():
    global score
    score = 0
```

```pyson file=screens/game.pysn
import includes.state as state
def update():
    state.score += 1
```

```pyson file=main.pysn
import includes.state as state
from screens.game import update
state.reset()
update()
print(state.score, 0, 0)
refresh_screen()
```

## 13. API signatures

This catalog gives exact public argument names and omitted defaults. It does
not imply all arguments accept runtime values: the preceding sections specify
literal declarations, palette/button restrictions, and handle types. A displayed
`effect default` means use that effect's priority; it is not a `None` literal.
The instrument default applies to the wave voice; do not explicitly provide it
for pulse music. `worldmap(..., collision omitted)` means omit the option,
not write `None`. `randrange(stop)` is the supported one-argument overload.

### Special forms and injected helpers

| Call | Restrictions |
|---|---|
| `range(stop)` / `range(start, stop, step=1)` | For-loop syntax; step must be literal |
| `abs(value)`, `min(a,b)`, `max(a,b)`, `clamp(value,low,high)` | Numeric helpers; two-argument min/max |
| `move_x(board,x,y,width,height,delta)`, `move_y(board,x,y,width,height,delta)` | Pixel sweep; return new coordinate |
| `record(field=value, ...)` | Named fixed integer fields |
| `records(count, field=value, ...)` | Literal count, fixed schema |
| `pool(capacity, field=default, ...)` | Literal defaults/count, module level |
| `spawn(pool, field=value, ...)` | Runtime integer field overrides; returns handle |
| `format_text(template, value1, ...)` | Literal template; 0..4 matching integer substitutions |

<!-- API-SIGNATURES:BEGIN -->

| Public call |
|---|
| `print(value, x, y, palette=0)` |
| `print_window(value, x, y, palette=0)` |
| `bg_palette(index, color0, color1, color2, color3)` |
| `sprite_palette(index, color0, color1, color2, color3)` |
| `clear_screen(palette=0)` |
| `clear_window(palette=0)` |
| `sprite(slot, sheet, frame, x, y, flip_x=False, flip_y=False)` |
| `world_sprite(slot, sheet, frame, x, y, flip_x=False, flip_y=False)` |
| `hide_sprite(slot)` |
| `draw_map(map, x, y)` |
| `draw_world(map)` |
| `set_camera(x, y)` |
| `window_position(x, y)` |
| `set_map_tile(map, x, y, tile)` |
| `reset_map(map)` |
| `rect_is_solid(map, x, y, width, height)` |
| `tile_terrain(map, x, y)` |
| `tile_is_solid(map, x, y)` |
| `tile_at(map, x, y)` |
| `map_width(map)` |
| `map_height(map)` |
| `background_clip(path, width, height)` |
| `draw_tile_grid(cells, columns, x=0, y=0)` |
| `draw_tile_field(columns, rows, tiles, x=0, y=0)` |
| `draw_background(clip, frame, x=0, y=0)` |
| `sprite_sheet(path, width=8, height=8)` |
| `tile(path, solid=False, terrain=0, x=0, y=0)` |
| `tilemap(source)` |
| `mutable_map(rows)` |
| `collision_map(rows)` |
| `worldmap(source, collision=omitted)` |
| `constant(value)` |
| `constant_table(values)` |
| `fixed(value)` |
| `int(value)` |
| `sprite_animation(sheet, steps, loop=True)` |
| `play_animation(slot, animation, restart=False)` |
| `restart_animation(slot)` |
| `stop_animation(slot)` |
| `update_animations(ticks=1)` |
| `animated_sprite(slot, x, y, flip_x=False, flip_y=False)` |
| `world_animated_sprite(slot, x, y, flip_x=False, flip_y=False)` |
| `animation_frame(slot)` |
| `animation_finished(slot)` |
| `animation_playing(slot)` |
| `save_write(slot, value)` |
| `save_read(slot, default=0)` |
| `save_exists(slot)` |
| `save_delete(slot)` |
| `random_seed(seed)` |
| `randint(low, high)` |
| `randrange(start=0, stop)` |
| `rect_overlap(ax, ay, aw, ah, bx, by, bw, bh)` |
| `elapsed_frames(previous)` |
| `wait_frames(count)` |
| `button(name)` |
| `button_pressed(name)` |
| `len(array)` |
| `dialogue_speaker(name)` |
| `dialogue_portrait(sheet, frame=0, palette=0)` |
| `start_dialogue(text, speed=2, palette=0)` |
| `start_choices(labels, palette=0, selected_palette=0, default=0, cancel=True)` |
| `music_track(notes, loop=True, duty=2, voice=0, instrument="triangle")` |
| `music_file(path, part=0)` |
| `play_music(track, restart=False)` |
| `sound_effect(channel, steps, priority=3, duty=2)` |
| `play_sound(effect, priority=effect default)` |
| `mute_sound(muted=True)` |
| `set_sound_volume(left, right)` |
| `reset_pool(pool)` |
| `pool_count(pool)` |
| `despawn(handle)` |
| `pool_index(handle)` |
| `refresh_screen()` |
| `show_window()` |
| `hide_window()` |
| `camera_x()` |
| `camera_y()` |
| `save_clear()` |
| `save_capacity()` |
| `frame_count()` |
| `wait_vblank()` |
| `read_buttons()` |
| `stop_music()` |
| `pause_music()` |
| `resume_music()` |
| `music_playing()` |
| `stop_sound()` |
| `sound_playing()` |
| `update_dialogue()` |
| `close_dialogue()` |
| `dialogue_active()` |
| `dialogue_waiting()` |
| `dialogue_finished()` |
| `choices_active()` |
| `choices_finished()` |
| `choices_cancelled()` |
| `choices_result()` |
| `choices_selected()` |

<!-- API-SIGNATURES:END -->

## 14. Implementation navigation and maintenance

Use this manual and [feature references](documentation/README.md) for ordinary
game authoring. Read source for compiler bugs, missing contracts, or unusual
limits. Useful entry points: `src/cli.js`, `src/compiler.js`, `src/codegen.js`,
`src/builtin-arguments.js`, `src/assets.js`, `src/world-assets.js`,
`src/build-report.js`, `scripts/environment.js`, `scripts/setup.js`, and `include/`.
The grammar/lexer live in `jison/`; list actual filenames before opening them.

Examples by purpose: hello-world, button-counter, fractional-motion,
array-inventory, record-fleet, pool-shooter, scrolling-world, streaming-world,
dialogue-garden, animation-gallery, sound-gallery, music-gallery, save-counter,
banked-functions, feature-lab, vault-run, meteor-guard. Larger demonstrations:
Void Engine, Lucid Circuit, Last Light, Oath of Stars, Zero Signal, Iron Litany.
Star Squadron specifically demonstrates 40 components with verified scanline
budgets; it is automatic, not a complete interactive shooter.

When extending Pyson: update implementation, signatures/defaults, tests, feature
docs, relevant tutorial/example, this manual, and CONTEXT.MF. Keep optional
tooling out of required setup. Do not claim a planned debugger, memory optimizer,
hardware effect, or unsupported Python construct is available. Preserve the
user's edit/plan/approval workflow and explicitly requested scope.
