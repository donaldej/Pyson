# Sound effects

Sound effects work on both original Game Boy and Game Boy Color. Playback is
nonblocking: movement, input, and drawing continue while an effect plays.

```python
play_sound("collect")
```

## Routines

| Call | Behavior |
| --- | --- |
| `play_sound(effect, priority)` | Start a built-in name or custom effect. Omit the optional priority argument to use the effect's priority; an explicit priority is an integer 0..7. |
| `stop_sound()` | Stop the current effect immediately. |
| `sound_playing()` | Return whether an effect is active, including its silent rests. |
| `set_sound_volume(left, right)` | Set each speaker's master level to 0..7. Initial levels are both 7; both arguments are required. |
| `mute_sound(muted=True)` | Mute and stop playback, or unmute when passed `False`. Unmuting does not resume a stopped effect. |

There is one effect voice. A higher or equal priority interrupts the current
effect; a lower priority is ignored. Playing the same effect at equal priority
restarts it. Muted playback requests are ignored. There is no playback queue.
Invalid dynamic volume or priority values are ignored; invalid literals are
compile errors.

Master volume 0 is the hardware's quietest level, not silence. Use `mute_sound()`
for silence. Pulse effects use hardware channel 2; noise uses channel 4.
[Background music](music.md) uses channel 1 for pulse and channel 3 for wave music.
Hardware behavior is described in
[Pan Docs audio registers](https://github.com/gbdev/pandocs/blob/master/src/Audio_Registers.md).

## Built-in effects

| Name | Channel | Priority | Duration in ticks | Effect data bytes |
| --- | --- | --- | --- | --- |
| `"menu_move"` | Pulse | 1 | 3 | 8 |
| `"menu_confirm"` | Pulse | 2 | 10 | 12 |
| `"collect"` | Pulse | 3 | 11 | 12 |
| `"damage"` | Noise | 4 | 17 | 16 |
| `"win"` | Pulse | 6 | 37 | 20 |
| `"lose"` | Pulse | 5 | 34 | 16 |

Names must be string literals in `play_sound()`. For a dynamic selection, branch
to calls with literal names, as the sound gallery does.

## Custom effects

Declare effects at module scope using positional or [named](arguments.md) literal arguments:

```python
# Each pulse step is [frequency in Hz, duration in ticks, volume].
chime = sound_effect("pulse", [
    [523, 6, 10],
    [0, 2, 0],       # Silent rest.
    [784, 8, 8],
], 3, 1)            # Priority 3, pulse duty 1.

# Each noise step is [hardware noise parameter, ticks, volume].
splash = sound_effect("noise", [[36, 3, 6], [52, 4, 3]], 1)

play_sound(chime)
play_sound(splash, 5)  # Override priority for this playback.
```

`sound_effect(channel, steps, priority=3, duty=2)` is the conceptual signature;
parameters accept positional or named arguments. Noise effects omit duty.

- Effects contain 1..64 steps. Each step lasts 1..255 ticks, with volume 0..15.
- Pulse frequency is 64..20000 Hz, rounded to an available hardware frequency.
  Frequency 0 creates a rest, regardless of its volume.
- Pulse duty 0, 1, 2, 3 selects 12.5%, 25%, 50%, 75%; the default is 50%.
- Noise parameters are raw NR43 values 0..223. They select the clock divider,
  shift, and 7-bit versus 15-bit noise mode. Noise parameter 0 produces noise;
  use volume 0 for a noise rest.
- Priority is 0..7, default 3.

Custom effect bindings are immutable and cannot be reassigned, aliased, stored
in integer arrays, or passed as ordinary function arguments. Import an effect
module and use `play_sound(effects.chime)` to share a definition across screens.
Imports initialize the shared module once.

## Timing and memory

Using a [hardware frame timing helper](frame-timing.md) makes effects account
for elapsed display frames when serviced. Without those helpers, the existing
wait-driven timing below applies. Audio remains cooperative in either mode.

Sound commands take effect immediately. They do not wait for `refresh_screen()`.
Sequence advancement happens when the runtime waits for a fresh VBlank through
`wait_vblank()` or `refresh_screen()`. A refresh also waits while an effect is
active even if nothing changed visually. Effects continue after a finite main
program ends because its idle loop services sound.

One tick is approximately one frame (about 60 per second) in a normal game loop.
This is a cooperative player: long calculations or bulk screen loads can delay
ticks. It does not run from an interrupt or catch up missed frames. A tight loop
that never waits or refreshes will not advance the sequence.

Only statically referenced effects are emitted, each once. This includes calls
inside compiled functions even if those functions never run. A game without
sound API calls includes no sound runtime or audio state RAM. A declared but
unplayed custom effect emits no effect data, though its named binding still
uses the usual two-byte variable slot.

Audio state uses 11 bytes of WRAM. Each referenced custom binding also uses two
bytes; each effect uses a four-byte ROM header plus four bytes per step. The
build writes `build/<name>.sounds.json` with included effects and encoded bytes.
Current effects and runtime occupy ROM bank 0. Graphics and maps use
[automatic ROM banking](banking.md). Two simultaneous music voices, including
custom wave instruments, are supported; see [music](music.md).

## Sound gallery

```powershell
npm.cmd run build -- examples/sound-gallery/main.pysn sound-gallery
```

Open `binary/sound-gallery.gb` in an emulator. Up/Down selects an effect, A plays,
B stops, Left/Right adjusts volume, and Select toggles mute. Star Chase also uses
menu, collection, win, and loss effects; the scrolling demo adds a custom water
sound and a victory sound.

## Background music

[Background music](music.md) uses channels 1 and 3 independently of these effects.
`set_sound_volume()` controls both. `mute_sound()` stops both; unmute does not
resume stopped tracks. `stop_sound()` and `sound_playing()` affect effects only.
