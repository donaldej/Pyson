# Star Chase

A complete game with colored BMP sprites, a title screen, a game screen, and
win/loss menus. It runs on original Game Boy with grayscale fallback and uses
color on Game Boy Color.

## Play

- **A** or **Start** starts the game from the title screen.
- **D-pad** moves the cyan character one tile at a time; holding repeats.
- Collect **10 gold stars** to win. Avoid the red enemy, which gets faster
  as the score rises. The border keeps characters inside the play area.
- After winning or losing, **Up/Down** highlights **Replay** or **Title Screen**.
  Press **A** to confirm. Replay resets the entire round.

Stars appear in a deterministic sequence after collection. Touching the enemy,
including moving through its old position, ends the round.

Menus play navigation and confirmation sounds. Collecting a star plays a chime;
winning and losing play their own effects. See [sound effects](sound.md).

The best star count is saved when a round ends and shown on the title and result
screens. It persists across restarts when the emulator preserves cartridge RAM;
replay resets the current score while retaining the best. Save calls automatically
configure MBC5 with 8 KB battery-backed RAM. See [persistent saves](save.md).

## Build

```powershell
npm.cmd run build -- examples/star-chase/main.pysn star-chase
```

Open `binary/star-chase.gb` in an emulator. Assembly, debugger symbols, and asset
metadata are written to `build/star-chase.asm`, `.sym`, and `.assets.json`.

## Project layout

```text
examples/star-chase/
  main.pysn                 frame loop and screen dispatch
  assets/                   original BMP sprites and board
  includes/
    state.pysn              shared variables and reset routines
    graphics.pysn           asset imports, nested board, and drawing helpers
    menu.pysn               highlight and confirmation logic
  screens/
    title.pysn              title screen
    game.pysn               gameplay and win/loss screens
  classic.pysn              original text-only version
```

The main file provides the scaffold. Each screen performs one update and reads
or writes shared variables through `includes.state`. The state's reset functions
use `global`; imported assets resolve relative to `includes/graphics.pysn`.
See [modules](modules.md) and [graphics](graphics.md).

`includes/graphics.pysn` builds the board from reusable `brick.bmp` and
`floor.bmp` tiles using a nested list. Bricks are solid with terrain label 1;
floor tiles are walkable with terrain label 0. Player movement, enemy movement,
and star placement check the same board using `tile_is_solid`. The layout and
shared property definitions occupy 268 bytes of ROM, plus the descriptor and
graphics. The board is drawn at screen row 3, so checks subtract 3 from screen
tile Y. See [nested tile maps](tilemaps.md) and [collision](collision.md).
Imported brick and floor palettes use slots 1 and 2; HUD gold uses slot 5 to
avoid overwriting either tile palette.

Artwork is included, so no generation step is needed. Edit its BMP files in a bitmap editor.
The original text game remains available:

```powershell
npm.cmd run build -- examples/star-chase/classic.pysn star-chase-classic
```

Player idle/walk and enemy animation use [sprite animation helpers](animation.md).
Definitions live in the graphics module; slots 0 and 2 track their independent
playback. Timing counts game-loop updates; buffered presentation and input waits
can consume more than one hardware frame per update.

## Background music

`includes/music.pysn` selects a looping title or gameplay melody when the screen
changes. Winning and losing select one-shot melodies. `sync_music()` remembers
the last screen so a finished one-shot stays stopped. Sound effects continue
on their own channels. See [music](music.md) for the APIs and timing model.
