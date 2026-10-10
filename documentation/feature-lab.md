# The six-feature development batch

Build and run:

```powershell
npm.cmd run build -- examples/feature-lab/main.pysn feature-lab
```

- D-pad: move; pixel sweeps stop at walls and slide along them.
- A: open/close the door in the divider, at map tile `(10, 5)`.
- B: restore the map and player, and close dialogue.
- Select: talk to the guide, with a portrait and a snapshot of game state.
- Start: pause/resume both music voices when dialogue is closed.

Walk to the doorway at player map Y=40. Closing it while occupied is prevented.
The HUD continues formatting text while the guide's dialogue remains unchanged.
`LAST` shows the player position at the last board redraw; the dialogue captures
the current position when Select is pressed.
The example uses constants, default/named function arguments, clamping, a mutable
map, swept movement, and an imported pulse/wave composition. Its build report
shows memory categories and source addresses.

The six areas implemented in this batch are [mutable terrain](mutable-maps.md),
[movement helpers](movement.md), [richer dialogue](dialogue.md),
[richer music](music.md), [diagnostics](diagnostics.md), and
[language conveniences](math.md). Remaining limits are documented with each API.
This batch does not implement the deferred RAM-reuse/assembly optimization pass.
