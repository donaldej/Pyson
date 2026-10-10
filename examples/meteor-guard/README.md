# Meteor Guard

An arcade defense game for Game Boy and Game Boy Color. Destroy falling meteors
before they cross the defense line. Tough meteors need two hits; every five
points increases the wave difficulty, up to wave four. You have five lives.

```powershell
npm.cmd run build -- examples/meteor-guard/main.pysn meteor-guard
```

Open `binary/meteor-guard.gb`. Left/Right moves, holding A fires, Start pauses
gameplay and music, B restarts, and Select opens instructions. A advances help
and B closes it. After game over, Up/Down and A choose retry or final-score
dialogue. The best score is saved in cartridge RAM slot 0 when a round ends.

This project demonstrates shared modules and records, fixed object pools,
handle helpers, safe removal during iteration, stable sprite-slot assignment,
rectangle collision, seeded random spawns, array-based difficulty, math helpers,
default and keyword arguments, dialogue, menus, formatted HUDs, two-voice music,
effects, and persistent saves. Randomness is initially repeatable; restarting
seeds it from the frame counter. No objects or arrays grow dynamically.

`includes/actors.pysn` owns the ship, ten bullet slots, and five meteor slots.
Gameplay freezes during help and choices. HUD drawing happens only when needed.
`assets/` reuses the existing shooter artwork and two-part music example.

With the optional emulator environment installed, `npm.cmd run test:examples`
checks both showcase games on DMG and Color, including save reloads. The defeat
scenario sets up a known score and one remaining life before letting a meteor
reach the defense line.
