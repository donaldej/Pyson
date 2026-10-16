# Named arguments

Built-ins with fixed parameter lists accept their public parameter names. Existing
positional calls still work. Named arguments make long calls easier to read,
allow optional arguments to be skipped, and can appear in any order.

`sprite(0, hero, frame, x, y, False, True)` can be written as:

`sprite(0, hero, frame, x=x, y=y, flip_y=True)`

The omitted `flip_x` stays `False`. The first five parameters remain required;
using names does not give them defaults. These names belong to the public Pyson
API; they do not expose assembly registers or internal variable names.

## Rules

- Put positional arguments before named arguments.
- Use the exact, case-sensitive public parameter name. For example, print uses
  `value`, not `text`, and palette setters use `color0` through `color3`.
- Supply each parameter once. Unknown, duplicate, missing, and excess arguments
  are compile errors, reported with the source location.
- Explicit expressions evaluate once, in the order written, including nested
  calls. Reordering named expressions can therefore change side effects.
- Type, literal, range, and declaration restrictions still apply. For example,
  `sprite_sheet(path="assets/hero.bmp", width=16, height=16)` is a compile-time
  declaration; named arguments do not make its dimensions dynamic.

`randrange(stop=6)` means `randrange(0, 6)`.
`randrange(start=-3, stop=6)` supplies both bounds; `start` alone is invalid.
`play_sound(effect="collect")` keeps that effect's default priority.

User-defined functions and the helpers `abs(value)`, `min(a, b)`, `max(a, b)`,
`clamp(value, low, high)`, and `move_x/move_y(board, x, y, width, height, delta)`
also accept named arguments. See [functions](functions.md).
User-defined string parameters use the same rules, for example
`show_message(text="READY", palette=1)`.

## Public built-in parameters

The table lists names in positional order. The second column lists optional
defaults; every other parameter is required. No-argument routines accept no
keywords. Feature references describe ranges, return values, and hardware limits.

| Public parameter names | Optional defaults |
| --- | --- |
| `animated_sprite(slot, x, y, flip_x, flip_y)` | `flip_x=False`, `flip_y=False` |
| `animation_finished(slot)` | None |
| `animation_frame(slot)` | None |
| `animation_playing(slot)` | None |
| `bg_palette(index, color0, color1, color2, color3)` | None |
| `button(name)` | None |
| `button_pressed(name)` | None |
| `camera_x()` | None |
| `camera_y()` | None |
| `choices_active()` | None |
| `choices_cancelled()` | None |
| `choices_finished()` | None |
| `choices_result()` | None |
| `choices_selected()` | None |
| `clear_screen(palette)` | `palette=0` |
| `clear_window(palette)` | `palette=0` |
| `close_dialogue()` | None |
| `collision_map(rows)` | None |
| `constant(value)` | None |
| `constant_table(values)` | None |
| `fixed(value)` | None |
| `int(value)` | None |
| `despawn(handle)` | None |
| `dialogue_active()` | None |
| `dialogue_finished()` | None |
| `dialogue_portrait(sheet, frame, palette)` | `frame=0`, `palette=0` |
| `dialogue_speaker(name)` | None |
| `dialogue_waiting()` | None |
| `draw_map(map, x, y)` | None |
| `draw_world(map)` | None |
| `elapsed_frames(previous)` | None |
| `frame_count()` | None |
| `hide_sprite(slot)` | None |
| `hide_window()` | None |
| `len(array)` | None |
| `map_height(map)` | None |
| `map_width(map)` | None |
| `music_file(path, part)` | `part=0` |
| `music_playing()` | None |
| `music_track(notes, loop, duty, voice, instrument)` | `loop=True`, `duty=2`, `voice=0`, `instrument="triangle"` |
| `mutable_map(rows)` | None |
| `mute_sound(muted)` | `muted=True` |
| `pause_music()` | None |
| `play_animation(slot, animation, restart)` | `restart=False` |
| `play_music(track, restart)` | `restart=False` |
| `play_sound(effect, priority)` | `priority=effect priority` |
| `pool_count(pool)` | None |
| `pool_index(handle)` | None |
| `print(value, x, y, palette)` | `palette=0` |
| `print_window(value, x, y, palette)` | `palette=0` |
| `randint(low, high)` | None |
| `random_seed(seed)` | None |
| `randrange(start, stop)` | `start=0` |
| `read_buttons()` | None |
| `rect_is_solid(map, x, y, width, height)` | None |
| `rect_overlap(ax, ay, aw, ah, bx, by, bw, bh)` | None |
| `refresh_screen()` | None |
| `reset_map(map)` | None |
| `reset_pool(pool)` | None |
| `restart_animation(slot)` | None |
| `resume_music()` | None |
| `save_capacity()` | None |
| `save_clear()` | None |
| `save_delete(slot)` | None |
| `save_exists(slot)` | None |
| `save_read(slot, default)` | `default=0` |
| `save_write(slot, value)` | None |
| `set_camera(x, y)` | None |
| `set_map_tile(map, x, y, tile)` | None |
| `set_sound_volume(left, right)` | None |
| `show_window()` | None |
| `sound_effect(channel, steps, priority, duty)` | `priority=3`, `duty=2` |
| `sound_playing()` | None |
| `sprite(slot, sheet, frame, x, y, flip_x, flip_y)` | `flip_x=False`, `flip_y=False` |
| `sprite_animation(sheet, steps, loop)` | `loop=True` |
| `sprite_palette(index, color0, color1, color2, color3)` | None |
| `background_clip(path, width, height)` | None |
| `draw_tile_grid(cells, columns, x, y)` | `x=0`, `y=0` |
| `draw_tile_field(columns, rows, tiles, x, y)` | `x=0`, `y=0` |
| `draw_background(clip, frame, x, y)` | `x=0`, `y=0` |
| `sprite_sheet(path, width, height)` | `width=8`, `height=8` |
| `start_choices(labels, palette, selected_palette, default, cancel)` | `palette=0`, `selected_palette=0`, `default=0`, `cancel=True` |
| `start_dialogue(text, speed, palette)` | `speed=2`, `palette=0` |
| `stop_animation(slot)` | None |
| `stop_music()` | None |
| `stop_sound()` | None |
| `tile(path, solid, terrain, x, y)` | `solid=False`, `terrain=0`, `x=0`, `y=0` |
| `tile_at(map, x, y)` | None |
| `tile_is_solid(map, x, y)` | None |
| `tile_terrain(map, x, y)` | None |
| `tilemap(source)` | None |
| `update_animations(ticks)` | `ticks=1` |
| `update_dialogue()` | None |
| `wait_frames(count)` | None |
| `wait_vblank()` | None |
| `window_position(x, y)` | None |
| `world_animated_sprite(slot, x, y, flip_x, flip_y)` | `flip_x=False`, `flip_y=False` |
| `world_sprite(slot, sheet, frame, x, y, flip_x, flip_y)` | `flip_x=False`, `flip_y=False` |
| `worldmap(source, collision)` | `collision=omitted` |

For `tilemap` and `worldmap`, `source` can be a BMP path or nested tile rows.
`tile`'s `solid` and `terrain` options, and BMP `worldmap`'s `collision`
option, are keyword-only. Collision rows are optional for BMP worlds and are
not accepted for nested worlds. Music's `instrument` requires `voice=1`;
noise sound effects do not accept `duty`. Omitted options retain those restrictions.

## Field and variable-length APIs

These follow their existing special rules rather than the fixed-parameter table:

- `record(x=0, y=0)` names game-defined fields.
- `records(8, x=0, y=0)` and `pool(8, x=0, y=0)` take a positional capacity,
  followed by named field defaults.
- `spawn(enemies, x=12, y=16)` takes a positional pool, followed by named field
  overrides. These keywords are your field names, not general API parameters.
- `format_text("HP {} / {}", hp, maximum)` takes a positional template and
  positional values for its variable number of placeholders.
- `range(stop)`, `range(start, stop)`, and `range(start, stop, step)` use
  positional bounds in a for loop, following Python's convention.

Naming arguments changes call readability, not storage allocation. Reordered
runtime arguments use temporary stack space; positional calls and names written
in parameter order keep the existing evaluation path. No extra persistent WRAM
variables are allocated for keywords.

For a guided exercise, see [readable calls](../tutorials/09-readable-calls.md).
