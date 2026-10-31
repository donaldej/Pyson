# Shadow Terminal: Iron Eclipse

A standalone military sci-fi music demo for Game Boy and Game Boy Color.
It keeps the DEFCON 5-to-1 progression and Shadow Terminal identity, with new
holographic imagery and four newly composed electronic movements.

```powershell
npm.cmd run build -- examples/shadow-eclipse/main.pysn shadow-eclipse
```

Open `binary/shadow-eclipse.gb`. **Start** pauses/resumes; **A** advances.
The roughly 64-second sequence repeats. Previous Shadow Terminal examples
remain separate and unchanged.

Each DEFCON level begins with a large central digit for two seconds. The digit
and timer then move into a compact display at the upper right, opening the
center for the hologram. Each level lasts ten seconds; the timer counts from
00:10 through 00:01. Five readiness lamps show the escalation. DEFCON 1 is
fictional maximum readiness, not a weapon firing. There are no scene-name
captions and no warning beeps before transitions.

The visual sequence uses a helmet-like command intelligence, a projected
orbital octahedron, a surveillance globe, a rotating double helix, an angular
interceptor, and counter-rotating containment rings. The command intelligence
returns with SHADOW TERMINAL and a small Pyson credit at the end.

The original score develops from sparse pulse figures into denser electronic
phrases at roughly 150 BPM. Eight-bar harmonic progressions, a custom 32-sample
wave-channel bass instrument, four-on-the-floor kick, backbeat snare and periodic
fills give it more musical variation. Adjacent visual acts can share a
continuous movement. Pause adjusts the percussion clock to retain its phase.

## How it works

- `main.pysn` runs the timeline and changes from large to compact countdowns.
- `includes/art.pysn` selects seven 48-frame clips and their palettes.
- `includes/overlay.pysn` draws live sprite text, numbers and packet tracers.
- `includes/score.pysn` controls the two music voices and separate percussion.
- `assets/` includes all BMP and music JSON files needed to compile.

The 3D projection and glow contours are authored into the BMP clips; this
example does not calculate their 3D geometry while the ROM runs. Pyson chooses
frames, streams exact shared tile patterns, manages the live countdown and
moves sprite telemetry at runtime. This is animation-asset playback, not MP4
playback. A compact marching-square edge vocabulary keeps these authored
contours within the hardware tile budget without discarding uncommon tiles.

No new compiler dependencies or required authoring tools are introduced.
The normal Pyson setup is sufficient to compile the included assets. The
optional generator is a maintainer tool, not part of the build.

## Testing

Watch a full cycle and check all five DEFCON levels. Each should show its large
number first, then clear that number and move the countdown to the corner.
Check the holograms become unobstructed, and that the title and finale say
SHADOW TERMINAL. Pause during both countdown layouts and resume; try A to skip.
Optional PyBoy tools in `dev-tools/recordings/shadow-eclipse-check.py` and
`shadow-eclipse.py` validate or capture the demo. Recording also needs FFmpeg.
