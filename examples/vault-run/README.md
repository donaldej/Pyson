# Vault Run

A small exploration puzzle for Game Boy and Game Boy Color. Collect the two
stars in the left room, open the center door, collect the third star, and reach
the `E` exit in the right room. Each victory is saved to cartridge RAM.

```powershell
npm.cmd run build -- examples/vault-run/main.pysn vault-run
```

Open `binary/vault-run.gb`. D-pad moves; A opens the door when standing beside
its left edge with two stars. Select opens the keeper's instructions; A advances
dialogue and B closes it. Outside dialogue, B restarts the round. After winning,
use Up/Down and A to choose replay or keep the victory screen.

This project demonstrates nested mutable tile maps, shared BMP tiles, terrain
collision and swept movement, arrays, animated sprites, constants, default and
keyword arguments, formatted portrait dialogue, choices, two-voice imported
music, sound effects, modules, and persistent progress. Map coordinates are
independent of the four-tile screen offset. Redraws and HUD updates occur only
when state changes. Restart restores the map and collectible array, while the
progress module retains saved wins. The map itself is not saved.

`includes/progress.pysn` owns save slot 0. `assets/` contains copies of the
existing project artwork and the shared two-part music example.

With the optional emulator environment installed, `npm.cmd run test:examples`
checks both showcase games on DMG and Color, including save reloads. Some test
scenarios place the player directly while dialogue pauses movement.
