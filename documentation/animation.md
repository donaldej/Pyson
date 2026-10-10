# Sprite animations

Define named sequences from an existing sprite sheet, then give each animated
object a playback slot. Definitions are shared ROM data; each slot tracks its
own step and remaining time.

```python
hero = sprite_sheet("assets/hero.bmp", 8, 8)
idle = sprite_animation(hero, [[0, 1]])
walk = sprite_animation(hero, [[0, 8], [1, 8]])
attack = sprite_animation(hero, [[2, 4], [3, 6], [0, 2]], loop=False)

while True:
    wait_vblank()
    update_animations()
    if button_pressed("a"):
        play_animation(0, attack, restart=True)
    elif not animation_playing(0):
        play_animation(0, idle)
    animated_sprite(0, 60, 70)
    refresh_screen()
```

This example requires a sheet containing at least four frames. Frame numbers
are zero-based, using the same frame order as `sprite()`. Add movement and
idle/walk selection as shown below.

## Definitions

`sprite_animation(sheet, steps, loop=True)` must be a top-level assignment. The
sheet must be a previously declared `sprite_sheet`, including an imported
module's sheet. Each step is a literal `[frame, ticks]` pair:

- 1..64 steps per animation.
- Frame indices from 0 through that sheet's frame count minus one.
- Duration 1..255 animation ticks per step.
- `loop` is literal `True` by default, or `False` for one-shot playback. The
  third argument may be positional or use `loop=False`.

Steps can repeat frames, hold a frame longer, or use any frame order. Definitions
are immutable. They cannot be reassigned, aliased, placed in integer arrays, or
passed as ordinary function arguments. Modules can share them through qualified
names, and helper functions can accept numeric slot IDs instead:

```python
# includes/poses.pysn
hero = sprite_sheet("../assets/hero.bmp")
walk = sprite_animation(hero, [[0, 8], [1, 8]])

def begin_walk(slot):
    play_animation(slot, walk)
```

## Playback and drawing

| Call | Behavior |
| --- | --- |
| `play_animation(slot, animation, restart=False)` | Select a named definition. A different definition starts at step 0 immediately. Selecting the same one preserves its progress and stopped/finished state. |
| `restart_animation(slot)` | Start the currently selected definition again at step 0, clearing its finished flag. Unassigned slots are ignored. |
| `stop_animation(slot)` | Stop advancement and clear the finished flag, preserving the selection and current frame. |
| `update_animations(ticks=1)` | Advance all playing slots by the requested number of logical ticks. Zero does nothing. |
| `animation_frame(slot)` | Return the current sprite-sheet frame, or -1 if the slot is invalid or unassigned. |
| `animation_playing(slot)` | Return whether the selected animation is advancing. |
| `animation_finished(slot)` | Return whether a one-shot reached the end of its final step. |
| `animated_sprite(slot, x, y, flip_x=False, flip_y=False)` | Queue the selected sheet and current frame at screen pixel coordinates. |
| `world_animated_sprite(slot, x, y, flip_x=False, flip_y=False)` | Queue the same drawing using world pixels and the current camera. |

`play_animation()` accepts its optional third argument positionally or as
`restart=True`. All fixed playback and drawing parameters also accept
[named arguments](arguments.md). Restart
expressions use normal numeric truth rules. Use a named definition directly in
`play_animation()`; branch between calls when choosing a sequence dynamically.

Slots are 0..39 and identify the first hardware sprite used by the object.
A 16x16 frame consumes four consecutive sprite entries, so independent objects
can use slots 0 and 4. Their occupied ranges must not overlap, and each frame
must fit the remaining hardware entries. Drawing a frame that would overflow
the 40-entry limit is ignored, matching `sprite()`.

Invalid literal slots are compile errors. Invalid dynamic slots are ignored by
commands; frame queries return -1 and Boolean queries return `False`. Commands
and drawing do not return a value.

One-shot playback holds its final frame after the full final-step duration,
sets `animation_finished()` to `True`, and sets `animation_playing()` to `False`.
Repeatedly selecting that same one-shot does not restart it. Use
`restart_animation()` or `play_animation(..., restart=True)` to replay it.
Looping animations remain playing and never report finished.

Stopping does not hide the sprite. Continue drawing to keep its frozen frame,
or call `hide_sprite(slot)`. Hiding alone does not change playback state. A
stopped animation restarts from its beginning when explicitly restarted;
there is no resume-from-current-step routine in this version.

## Timing and switching states

For elapsed-time animation, obtain `delta` using the
[hardware frame timing helpers](frame-timing.md) and pass it to
`update_animations(delta)`. Keep each call within the supported 0..255 ticks.

Animation ticks are game updates, not automatically counted hardware frames.
Call `update_animations()` once in the active game's update loop. Waiting for
VBlank, refreshing the screen, drawing, and querying never advance animations.
Skipping the update call pauses every slot without changing their playing
flags. Screens can therefore freeze gameplay animations during menus.

Advance existing playback before selecting or drawing newly started sequences:

```python
while True:
    wait_vblank()
    update_animations()
    if button("left") or button("right"):
        play_animation(0, walk)
    else:
        play_animation(0, idle)
    animated_sprite(0, player_x, player_y, facing_left)
    refresh_screen()
```

The same walk sequence may be selected every update without resetting its frame
timer. A newly selected sequence is visible at its first frame immediately and
advances on subsequent update calls. A step with duration 8 advances after eight
ticks. Different slots can use the same definition and start at different times.

`update_animations(n)` processes 0..255 ticks. Invalid literal counts are compile
errors; invalid dynamic counts are ignored. Batch updates cross step and loop
boundaries normally and stop at the end of a one-shot. Calling the routine twice
per update advances twice as fast. Long rendering or calculations can make one
game update longer than one physical frame; there is no interrupt scheduler or
automatic catch-up. Animation drawing shares existing sprite clipping, flips,
palettes, camera behavior, and `refresh_screen()` buffering.

## Memory and build output

Only definitions referenced by compiled `play_animation()` calls are emitted,
each once. Calls in compiled functions count even if those functions never run.
An unplayed definition has no sequence data, but its named binding still uses
the normal two-byte variable slot. Declaring a definition does not independently
remove its sprite-sheet asset from the existing graphics pipeline.

Games using playback, drawing, or animation queries include 40 fixed six-byte
states: **240 bytes of WRAM**, plus two bytes per named definition binding.
Games without those calls include no animation runtime or state array. Each
referenced sequence uses a three-byte ROM header and two bytes per step in bank
0. Frame graphics and sprite-sheet maps retain their existing asset deduplication
and [ROM banking](banking.md). This version does not bank animation sequences.

`build/<name>.animations.json` records included names, sprite-sheet handles,
loop flags, step lists, and encoded bytes. The slot state array is initialized
at startup; it is not part of cartridge save data.

## Examples

```powershell
npm.cmd run build -- examples/animation-gallery/main.pysn animation-gallery
npm.cmd run build -- examples/star-chase/main.pysn star-chase
npm.cmd run build -- examples/scrolling-world/main.pysn scrolling-world
```

The gallery displays two independently timed 16x16 players. A chooses walking,
B idle, Start plays a one-shot, Select restarts, Up stops the first player, Left
flips it, and Right pauses/resumes animation ticks for both players. Its counters
show the first player's frame, playing state, and completion state.

Star Chase uses idle/walk sequences for the player and a separate enemy sequence;
holding a direction selects walking. Replay restarts playback. The scrolling
demo uses `world_animated_sprite()` with the same idle/walk approach and camera.
