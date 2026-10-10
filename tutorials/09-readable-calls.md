# 9. Write readable calls

Goal: make long calls clear without memorizing every argument position.
This lesson is also useful while working through lesson 2.

Build [Color Sprites](../examples/color-sprites.pysn):

```powershell
npm.cmd run build -- examples/color-sprites.pysn color-sprites
```

Use the D-pad to move and A to change the palette. Its asset declaration says:

```python
hero = sprite_sheet("assets/hero.bmp", width=16, height=16)
```

The path occupies the first parameter. `width` and `height` are names from
Pyson's public API. This is equivalent to `sprite_sheet("assets/hero.bmp", 16, 16)`.
Names are optional; use them when they make the call easier to understand.

## Step 1: distinguish parameter names from variables

Inside the loop, find:

```python
sprite(0, hero, frame, x=x, y=y, flip_x=flipped)
```

In `x=x`, the left side names the sprite parameter. The right side reads the
game's variable. You could name that variable `player_x` and write
`x=player_x`. `flip_x=flipped` already demonstrates this distinction.
The labels do not declare new variables.

The public name must match exactly. `horizontal=x` is not an alias for `x`.
Find exact names in the [built-in parameter reference](../documentation/arguments.md).
User-defined functions use the parameter names in their `def` declaration.

## Step 2: skip an optional parameter

To flip vertically in a copy of the example, replace that sprite call with:

```python
sprite(0, hero, frame, x=x, y=y, flip_y=True)
```

`flip_x` stays `False`; you can supply a later option without filling its
earlier neighbor. The hero should appear upside down. The first five parameters
are still required. Named arguments do not supply defaults for required values.

Restore the original call when finished.

## Step 3: understand order

These are equivalent when their values are ordinary variables:

```python
sprite(0, hero, frame, x=x, y=y)
sprite(slot=0, sheet=hero, frame=frame, y=y, x=x)
```

Positional arguments must appear first. Supplying `x` twice, omitting a required
parameter, or misspelling a name causes a compile error. For clarity, normally
write named arguments in the same order as the documented signature.

Expressions run once in the order you write them. If `next_x()` and `next_y()`
change shared state, `y=next_y(), x=next_x()` calls `next_y()` first. Labels choose
the destination parameter; they do not reorder those side effects.

Field APIs keep their existing conventions: `spawn(enemies, x=12)` takes a
positional pool and then your game's field names. `range` and `format_text`
keep positional arguments. These exceptions are listed in the reference.

## Try it

Rewrite `print("COLOR + BMP DEMO", x=2, y=1, palette=2)` with all four names,
using `value="COLOR + BMP DEMO"`. Rebuild: the screen should look identical.
Then misspell `palette` as `pallete` and rebuild to see the compiler identify
the error. Correct the spelling afterward.

References: [named arguments](../documentation/arguments.md),
[functions](../documentation/functions.md), [graphics](../documentation/graphics.md).

[Previous: advanced visual demos](08-visual-demos.md) · [Next: text helpers](10-text-helpers.md)
