# Background music

Music supports a pulse melody on channel 1 and an independent wave part on
channel 3, while effects use channel 2 or channel 4. Both music voices work on
original Game Boy and Game Boy Color. Tracker-format imports remain unsupported;
JSON compositions can be imported at compilation.

```python
theme = music_track([
    [523, 12, 8],
    [659, 12, 8],
    [784, 24, 8],
    [0, 6, 0]
], loop=True, duty=2)

play_music(theme)
while True:
    wait_vblank()
    refresh_screen()
```

Declare tracks at module top level using literal nested lists. Each note is
`[frequency_hz, duration_ticks, volume]`:

| Field | Accepted values | Meaning |
|---|---|---|
| Frequency | `0`, or `64..20000` | Hertz, rounded to a hardware frequency; zero is a rest |
| Duration | `1..255` | Audio ticks for this note |
| Volume | `0..15` | Note volume; zero is silent |
| `loop` | `True` or `False`; default `True` | Repeat the whole track, or stop after its last note |
| `duty` | `0..3`; default `2` | Pulse duty: 12.5%, 25%, 50%, or 75% |

A track contains 1..255 notes. All fixed parameters accept [named arguments](arguments.md),
including `notes`, `loop`, `duty`, `voice`, and `instrument`. Frequencies such
as 262, 294, 330, 349, 392, 440, and 494 approximate
C4 through B4. Doubling the frequency raises it one octave.

## Playback controls

| Routine | Behavior |
|---|---|
| `play_music(track, restart=False)` | Start a named track. Selecting the same active or paused track preserves its position. A different track, a stopped track, or `restart=True` starts from the beginning. |
| `pause_music()` | Silence the melody and freeze its note and timer. |
| `resume_music()` | Resume a paused track at its saved position. A stopped track stays stopped. |
| `stop_music()` | Stop and silence the melody without affecting sound effects. |
| `music_playing()` | Return 1 while advancing, otherwise 0 (including pause, stop, and completion). |

`restart` accepts a positional value or keyword. Track arguments must refer
directly to a named declaration; bindings cannot be copied, reassigned, or passed
as numeric function parameters. Modules can share tracks and expose helper
functions that select them.

Repeatedly selecting a completed one-shot starts it again. Select one-shots on
events or screen transitions, rather than unconditionally every game update.

## Timing and shared audio controls

By default, music uses the same cooperative audio clock as [sound effects](sound.md). Each
`wait_vblank()` call advances audio once, including waits performed internally by
`refresh_screen()`. With one wait per hardware frame, 60 ticks is approximately
one second. An explicit wait followed by a refresh that also waits advances twice
per game update. Music continues in the compiler's idle loop when the source ends.

Using any [hardware frame timing helper](frame-timing.md) changes audio timing
to account for elapsed display frames. Slow updates then preserve musical time
position. Audio still needs regular waits or API calls to service note changes.

Long calculations and bulk screen transfers can delay playback. There is no
interrupt-driven audio clock or automatic catch-up. Paused music consumes no
note ticks. Resume retriggers the current note with its saved duration remaining.

`set_sound_volume(left, right)` controls the shared output for both music and
effects. `mute_sound()` stops both and disables their output. Unmuting with
`mute_sound(False)` enables output; select a track again to restart music.
`stop_sound()` affects effects only, and `sound_playing()` reports effects only.

Hardware channel routing and pulse frequencies follow
[Pan Docs audio registers](https://gbdev.io/pandocs/Audio_Registers.html).

## Storage and examples

Only tracks referenced by `play_music()` are emitted, once each even when imported
from multiple modules. Each track uses `3 + 4 * note_count` bytes in ROM bank 0.
Playback needs eight additional WRAM bytes, plus the shared eleven-byte audio
state and two bytes per declared track binding. Declaring an unused track adds
its binding but no music sequence, music state, or audio runtime. Calls in compiled
functions count as references even if those functions are never executed.

Builds produce `build/<name>.music.json` with the included tracks and encoded
bytes. Music definitions remain in bank 0 alongside main, runtime routines, and other small static
definitions; graphics banking does not expand music storage.

```powershell
npm run build -- examples/music-gallery/main.pysn music-gallery
```

Open `binary/music-gallery.gb`. A starts a looping melody, B plays a one-shot,
Start pauses/resumes, Select stops, Up/Down plays effects over the music, and
Left/Right mutes/unmutes all audio.

Star Chase also includes title and gameplay loops plus victory/defeat one-shots
in `examples/star-chase/includes/music.pysn`, selected only on screen changes.

## Two voices, instruments, and composition files

`music_track(notes, loop=True, duty=2, voice=0, instrument="triangle")` retains
the original pulse behavior at voice 0. Voice 1 uses the wave channel:

```python
lead = music_track([[440, 24, 8]], voice=0)
bass = music_track([[220, 24, 8]], voice=1, instrument="sine")
play_music(lead)
play_music(bass)
```

Each voice has its own note timer and loop. Selecting a new track replaces only
its voice. Pause, resume, stop, and mute apply to both; `music_playing()` reports
whether either is advancing. Effects continue using their separate channels.
Starting parts consecutively aligns their initial ticks; parts with different
total lengths loop independently, without automatic bar synchronization.

Wave instruments are `triangle`, `sine`, `square`, or `saw`, or a literal list of
32 samples ranging from 0 to 15. The pulse voice uses duty instead and rejects an
explicit wave instrument. Wave volume is quantized: 0 is silent, 1–3 quarter,
4–7 half, and 8–15 full. Frequency uses the wave channel's clock. Wave RAM is
written with its DAC disabled as described by [Pan Docs audio registers](https://gbdev.io/pandocs/Audio_Registers.html).
Each wave track adds 16 waveform bytes; wave playback adds eight WRAM bytes.

`music_file("assets/theme.json", part=0)` is a top-level constructor with
arguments (the second argument selects a part and may be named `part`). Paths resolve
relative to the declaring module. A file contains a track object with `notes`
and optional `loop`, `duty`, `voice`, `instrument`, or a `parts` array of those
objects. The same validation and unused-track omission apply as for inline tracks:

```json
{"parts": [
  {"notes": [[440, 24, 8]], "voice": 0},
  {"notes": [[220, 24, 8]], "voice": 1, "instrument": "triangle"}
]}
```

Use `music_file("theme.json")` and `music_file("theme.json", 1)` to declare both
parts, then play each. This is Pyson's composition format, not a MIDI, tracker,
or rendered audio importer. The Feature Lab demonstrates imported two-part music.
