# Optional video recording tools

These scripts record a complete demo loop as an MP4 with emulator audio.
You do not need them to build or play any example. All required assets are included.
Edit BMP artwork in a bitmap editor and edit the Pyson files directly.

Run from the repository root:

```powershell
npm.cmd run setup:emulator
npm.cmd run build -- examples/neon-requiem/main.pysn neon-requiem
tools/emulator-env/Scripts/python.exe dev-tools/recordings/neon-requiem.py

npm.cmd run build -- examples/lucid-circuit/main.pysn lucid-circuit
tools/emulator-env/Scripts/python.exe dev-tools/recordings/lucid-circuit.py

npm.cmd run build -- examples/oath-of-stars/main.pysn oath-of-stars
tools/emulator-env/Scripts/python.exe dev-tools/recordings/oath-of-stars.py

npm.cmd run build -- examples/last-light/main.pysn last-light
tools/emulator-env/Scripts/python.exe dev-tools/recordings/last-light.py

npm.cmd run build -- examples/zero-signal/main.pysn zero-signal
tools/emulator-env/Scripts/python.exe dev-tools/recordings/zero-signal.py

npm.cmd run build -- examples/iron-litany/main.pysn iron-litany
tools/emulator-env/Scripts/python.exe dev-tools/recordings/iron-litany.py

npm.cmd run build -- examples/star-squadron/main.pysn star-squadron
tools/emulator-env/Scripts/python.exe dev-tools/recordings/star-squadron.py
```

Install FFmpeg separately. If it cannot be found, pass
`--ffmpeg "C:/path/to/ffmpeg.exe"`. Use `--output "C:/path/to/video.mp4"`
to choose another output, or `--help` to see the options.

Default recordings go to `binary/<demo-name>.mp4`. Recorders use fresh in-memory
save RAM and leave your existing `.sav` files unchanged.
Recording replaces its chosen output file; choose a new name to preserve an earlier video.
Build first because recording needs the ROM and matching reports/symbols.
Rebuild after editing the example. Temporary recording files go under `build/`.
The compiler and setup do not depend on these recording scripts.

See [the feature reference](../documentation/README.md) for Pyson itself.
