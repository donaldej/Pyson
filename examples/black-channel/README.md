# Black Channel

A military sci-fi audiovisual piece about an intercepted machine transmission.
This is a separate demo from Dead Hand, with new artwork and a new soundtrack.
It uses abstract moving geometry rather than radar maps or a command dashboard.

```powershell
npm.cmd run build -- examples/black-channel/main.pysn black-channel
```

Open `binary/black-channel.gb`. **Start** pauses/resumes; **A** advances to the
next act. Each act lasts about sixteen seconds, and the four-act sequence loops.
Game Boy Color adds distinct cold blue, amber, violet and red palettes; original
Game Boy displays the same imagery and music in monochrome.

1. **Carrier Found:** crossing ribbons resemble a disturbed radio carrier.
2. **Seal Rotation:** a toothed cipher seal turns around a moving central bar.
3. **Signal Collide:** two displaced pressure sources form interference knots.
4. **Transmit Denied:** a six-bladed mechanical iris surrounds the signal core,
   with a Pyson credit.

The score uses a syncopated pulse melody, triangle bass, and separate percussion
channels. There are no sampled audio tracks or external music playback tools.

## How it is built

`main.pysn` controls scenes, timing, input and independent sprite telemetry.
`includes/art.pysn` declares four 32-frame background clips. These are animated
BMP assets, not video: Pyson stores their shared tile patterns in cartridge ROM
and displays selected frames through its background-clip renderer. The LCD stays
on while the next frame is prepared. As with all clips, complex uploads may
reduce the visual update rate, particularly on original Game Boy.

The artwork was authored with a small family of tile contour shapes. This keeps
its graphics dictionary small without removing uncommon tiles after rendering.
`includes/motion.pysn` supplies a sine table for the separately moving sprites;
`includes/score.pysn` controls music and percussion. Comments explain those parts
without requiring assembly knowledge.

All required BMP and JSON files are included in `assets/`. The normal Pyson
toolchain builds this example; no extra dependencies or asset generators are
required. Optional maintainer tools `dev-tools/recordings/black-channel.py` and
`black-channel-check.py` use PyBoy to record or review it. Video recording also
requires FFmpeg; neither tool is a prerequisite for building or playing the ROM.
