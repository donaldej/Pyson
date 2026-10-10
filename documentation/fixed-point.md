# Numbers with a fractional part

Use fixed-point numbers when a game value needs a fraction: movement slower than
one pixel per update, acceleration, gravity, or a camera that moves gradually.
"Fixed-point" means Pyson keeps a small fractional part without needing ordinary
floating-point numbers. You do not need to know assembly to use them.

## Start with a small example

```python
x = fixed(40)
speed = 0.5

x += speed
pixel_x = int(x)
print(pixel_x, 0, 0)  # Displays 40: x is 40.5, but the screen needs whole pixels.

x += speed
pixel_x = int(x)
print(pixel_x, 0, 1)  # Displays 41: two half-pixel steps add up to one pixel.
refresh_screen()
```

`fixed(40)` starts a fractional number at 40. Writing a decimal such as `0.5`
also creates a fractional number; `fixed(0.5)` means the same thing.
The variable `x` keeps its fraction between updates.

`int(x)` drops the fraction and returns a normal integer. It does not change
`x`. For negative numbers it also drops the fraction: `int(-1.5)` is `-1`.

The Game Boy screen cannot draw half a pixel. A sprite moving half a pixel per
update therefore moves one visible pixel every two updates. Keeping the fraction
lets you control its average speed without losing those smaller steps.

## Use it in a game

The [Fractional Motion example](../examples/fractional-motion/main.pysn) shows
three sprites moving at different speeds on Game Boy and Game Boy Color:

```powershell
npm.cmd run build -- examples/fractional-motion/main.pysn fractional-motion
```

Open `binary/fractional-motion.gb` in an emulator. The top sprite moves at one
pixel per update, the middle at half a pixel, and the bottom at one eighth of a
pixel. They turn around at the ends of their lanes. Press A to reset them.

Its drawing calls use `int(position)` to give the screen a whole-pixel coordinate.
Keep the original position fractional; do not write `position = int(position)`
each update, because that would throw away the small steps you wanted to keep.
See [Tutorial 12](../tutorials/12-fractional-movement.md) for an experiment.

## Arithmetic and comparisons

```python
position = fixed(40)
speed = 0.5
acceleration = 0.125

speed += acceleration       # speed becomes 0.625.
position += speed           # position becomes 40.625.
speed *= 2                  # speed becomes 1.25.
speed /= 2                  # speed becomes 0.625 again.
backwards = -speed          # backwards is -0.625.
half = fixed(1) / 2         # half is 0.5.

if position > 40:
    print("MOVED", 0, 0)
```

You can mix integers and fractional numbers in arithmetic and comparisons,
as long as the values fit the fractional range below. Pyson handles the conversion.
If a variable receives fractional values anywhere in the program, Pyson treats
that numeric variable as fixed-point throughout the program. To keep an integer
result, put it in a separate variable using `int(value)`.

| Operation | Result |
| --- | --- |
| `+`, `-`, `*` | Normal arithmetic; a fractional operand makes the result fixed-point |
| `/` | Fractional division; at least one operand must be fixed-point |
| `//` | Whole-number division rounded downward; the result is an integer |
| `%` | Remainder; with a fractional operand the result is fixed-point |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | Compare values and return `1` or `0` |
| `int(value)` | Drop the fraction; integer input stays unchanged |
| `fixed(value)` | Make an integer fractional, or keep an existing fixed-point value |

`1 / 2` is unsupported because both operands are integers. Write `fixed(1) / 2`
for a fractional result, or `1 // 2` for integer division.
The distinction between `int` and `//` matters for negatives: `int(-1.5)` is `-1`,
while `-1.5 // 1` is `-2` because floor division rounds downward.
Division by zero stops the game and shows the usual error message and location.

## Functions work too

```python
def advance(position, speed=0.5):
    return position + speed

x = fixed(40)
x = advance(x)                        # x becomes 40.5.
x = advance(position=x, speed=0.125)   # x becomes 40.625.
```

Functions can receive, return, and forward fractional numbers. No type
annotations are needed. Named arguments and numeric defaults work normally.
Integer arguments can be used where a helper expects fixed-point values,
provided they fit the supported range. `abs`, `min`, `max`, and `clamp` also
work with these numbers when their arguments fit the range.

## Precision and limits

Each number uses two bytes and keeps steps of **1/16**, which is **0.0625**.

- `0.5`, `0.25`, `0.125`, and `0.0625` are exact.
- Other decimal literals are rounded to the nearest available step. For example,
  `0.1` becomes `0.125`. A value halfway between steps rounds away from zero.
- Multiplication and `/` drop any result smaller than one step, toward zero.
  For example, `0.0625 * 0.5` becomes `0.0`.
- The range is **-2048 through 2047.9375**. This supports ordinary screen
  positions, but not arbitrarily large world coordinates in a single number.
- Out-of-range literals are compile errors. Calculations and conversions of
  changing values can wrap around if they exceed the range, just as ordinary
  Pyson integers can. Keep positions and speeds within the range. For larger
  worlds, use an integer for the whole-pixel position and a separate small
  fractional movement value, or use positions relative to a nearby origin.

This is not general Python floating-point support. Use `0.5`, with digits on both
sides of the decimal point; scientific notation such as `1e-3` is unsupported.
Defaults are calculated at compile time and rounded to a supported step.

## Where to use whole numbers

Drawing coordinates, array indices, `range` bounds, palette numbers, button
values, saves, and other APIs that expect integers still need integers.
The variable used as a `range` loop counter must also stay an integer; use
a separate fractional variable for your position or speed.
Use `int(value)` when you want to drop a fraction deliberately:

```python
position = fixed(40)
print(int(position), 0, 0)
```

Printing fractional numbers directly is unsupported. Arrays, ROM tables,
record fields, and pool fields still store integers; this feature adds fractional
scalar variables and function values, not fractional collections. Bitwise
operators (`&`, `|`, `^`, `~`) also require integers.

There is no extra allocation for every update or calculation. Arithmetic and
conversion routines use eight shared bytes of working memory when needed.
Games that do not use this feature do not include its routines or scratch memory.
