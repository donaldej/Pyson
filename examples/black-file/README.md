# Black File

A standalone dark government-conspiracy audiovisual demo for Game Boy and
Game Boy Color. Its agency, case number and surveillance system are fictional.
The style is classified paperwork and surveillance equipment, rather than
another abstract hologram or military dashboard.

```powershell
npm.cmd run build -- examples/black-file/main.pysn black-file
```

Open `binary/black-file.gb`. **Start** pauses/resumes; **A** advances. The five
parts run for about ten seconds each, then repeat:

- A censored dossier with a moving scan and an obscured identity image.
- A security-camera corridor with a tracked silhouette and scanning line.
- Biometric gates surrounding a live **DEFCON 5 -> 4 -> 3 -> 2 -> 1** alert.
- Classified sheets disappearing into a document shredder.
- A fictional agency seal revealing **SHADOW TERMINAL** and a Pyson credit.

There are no scene-name captions at the screen edges. Words such as EYES ONLY
and SEALED belong to the pictured dossier. The DEFCON sequence appears only in
the biometric part: each level lasts two seconds, with a 00:02 / 00:01 timer.
DEFCON 1 is readiness, not a depiction of a weapon firing. There are no warning
beeps before scene changes.

The original score uses restrained pulse-channel phrases, gated bass and a
dark, syncopated electronic beat at about 112 BPM. Three harmonic movements
continue across related visual parts, with pause-aware percussion timing.

`main.pysn` runs the sequence; `includes/art.pysn` selects clips and palettes;
`includes/overlay.pysn` draws the live alert; `includes/score.pysn` schedules
music and percussion. All required BMP and music JSON files are included in
`assets/`. Compilation requires only the normal Pyson setup.

The 24-frame clips reuse exact architectural and font tile patterns. Image
animation is authored into those assets; the alert, timing, controls and audio
are managed by Pyson at runtime. No external video or music files are played.
Earlier examples and the compiler are unchanged.

Optional maintainer tools `dev-tools/recordings/black-file-check.py` and
`black-file.py` validate or capture the demo using PyBoy. Recording additionally
requires FFmpeg; these tools are not build dependencies.
