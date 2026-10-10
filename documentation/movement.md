# Movement against terrain

`move_x(board, x, y, width, height, delta)` returns a new X position after moving
the hitbox horizontally. `move_y(...)` has the same arguments and returns a new Y.
These helpers do not mutate your position variables:

```python
x = move_x(board, x, y, 8, 8, dx)
y = move_y(board, x, y, 8, 8, dy)
```

Both use map pixel coordinates and test every intermediate one-pixel position
with `rect_is_solid`. Movement stops at the last clear position, preventing a
large displacement from jumping through a thin wall. Positive and negative
deltas are supported; zero leaves the coordinate unchanged. Checking X then Y
lets the object slide along walls and gives X priority at diagonal corners.

An initially blocked or invalid hitbox stays at its original position. The
helpers do not depenetrate it, apply gravity, push other objects, or collide with
enemies. Use `rect_overlap` and game logic for actor interactions. Keep normal
frame displacements small: pixel sweeps cost more for long moves. Teleportation
should assign coordinates after checking the destination directly.

Helpers are emitted as ordinary banked functions only when called, with their
own static local storage. They use the current map collision data, including
edits to mutable maps, independently of the camera.
