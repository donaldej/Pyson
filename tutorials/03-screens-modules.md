# 3. Screens and shared state

Goal: organize a complete game without putting every routine into main.

## Step 1: play the reference game

Build [Star Chase](../examples/star-chase/main.pysn):

```powershell
npm.cmd run build -- examples/star-chase/main.pysn star-chase
```

A/Start begins the game; the D-pad moves the player. Catch stars and avoid the
enemy. Inspect the result menu after winning or losing: select replay or return
to title with the D-pad and A. Follow the game's displayed controls.

## Step 2: follow the scaffold

Main imports state and screen functions. Its central decision is:

```python
if state.screen == 0:
    title_screen()
else:
    game_screen()
```

Main owns the ongoing loop. Screens perform one update and return. This makes
input sampling, music synchronization, and final refresh easy to find.
Avoid adding an infinite loop inside a screen update unless you intentionally
want that function to take over the program.

Read [shared state](../examples/star-chase/includes/state.pysn),
[title logic](../examples/star-chase/screens/title.pysn), and
[game logic](../examples/star-chase/screens/game.pysn) in that order.
The title uses `state.redraw` to distinguish screen entry from later updates.
It draws the title once, then checks for a start press on subsequent calls.

## Step 3: choose where state belongs

`state.score` is shared module storage. Every importer sees the same value;
imports do not allocate another score or another copy of `reset_game`.
Initializers run once at startup, not whenever a screen opens.

Names assigned inside a function are local unless declared `global`. Qualified
writes such as `state.score += 1` directly update module state. A local named
`score` does not automatically refer to `state.score`.

Module paths resolve from main's folder. Asset paths resolve from the file
declaring the asset. Keep `includes/`, `screens/`, and `assets/` together when
copying this example.

## Try it

Copy the whole game and change the title message in `screens/title.pysn`.
Build the copy with a distinct output name. The title should change while the
game still starts and the replay/title menu still works. Then trace which
assignments set `state.screen` and `state.redraw` during a transition.

Do not add a shared scratch module just to make all variables global. Scratch
can save RAM, but helper calls may overwrite values the current screen needs.
Keep persistent state explicit.

References: [modules and scratch memory](../documentation/modules.md),
[functions and scope](../documentation/functions.md).

[Previous](02-sprites-animation.md) · [Next: worlds and collision](04-worlds-collision.md)
