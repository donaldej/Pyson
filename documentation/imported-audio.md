# Imported audio streams

Most games should use [music](music.md) and [sound effects](sound.md). An advanced
import tool can instead provide a JSON recording of Game Boy audio commands.
Pyson plays that file while your game continues running:

```python
theme = audio_file("assets/theme.json")
impact = audio_file("assets/impact.json")
play_audio(theme)
play_audio(impact, slot=1, priority=5)
```

Slot 0 is background audio; slot 1 is a temporary effect. Higher or equal
priorities replace an effect. Priorities range from 0 to 7. Slot and priority
must be literal numbers. `stop_audio(slot=0)` stops a slot. Declarations belong
at module scope; pass the declared name directly to `play_audio()`.

This is an alternative player. Do not combine it with `play_music()` or
`play_sound()` in the same running scene: both players control the same audio
hardware. The existing mute, pause, and volume routines do not manage streams.
Stop each slot explicitly when changing scenes or implementing a mute option.

Files use this format:

```json
{"format":"pyson-apu-1","frames":60,"loop":10,"events":[[0,38,128],[0,36,119],[0,37,255],[0,18,240],[0,19,128],[0,20,135]]}
```

An event is `[frame, register_offset, value]`. An importer supplies these numbers;
you do not need to write them by hand. Frames start at zero. Events must be
ordered, and offsets select writable APU registers in hexadecimal 10..3F.
`frames` is the total duration (1..1,000,000). Optional `loop` is the frame to
return to after the last frame. Omit it for finite sounds. Empty event lists
are allowed, including a silent loop. Long streams are split between ROM banks
automatically; only played definitions include stream data.

Effects temporarily take over the channels they write. Background commands for
those channels continue advancing in memory. After an effect, the player
restores the current background register state; hardware envelopes can restart.
This is not a copy of the imported game's sound driver or cycle-exact mixing.
An effect's master power, routing, and volume writes are ignored so it cannot
reset the rest of the song.

Playback advances at the hardware VBlank interrupt, so normal game calculations
do not bunch up its notes. Screen loads that stop the display also pause this
clock. Recorded commands have frame precision, not sub-frame timing. Stream
state uses 71 bytes of work RAM, plus the shared sound/frame-clock runtime and
two bytes per declared binding. Games that do not play streams include no
stream player. No extra installation dependency is required.
