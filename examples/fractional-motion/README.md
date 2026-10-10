# Fractional Motion

Three sprites move at 1, 0.5, and 0.125 pixels per update. They turn around at
the ends of their lanes. Press A to reset their positions and directions.

```powershell
npm.cmd run build -- examples/fractional-motion/main.pysn fractional-motion
```

Open `binary/fractional-motion.gb` in your emulator. The example supports the
original Game Boy and Game Boy Color. Its sprite artwork comes from the shared
`examples/assets` folder.

See the [plain-language number guide](../../documentation/fixed-point.md) and
[fractional movement tutorial](../../tutorials/12-fractional-movement.md).
