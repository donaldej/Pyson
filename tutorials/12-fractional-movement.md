# 12. Movement smaller than one pixel

Goal: control a sprite's speed using fractions while keeping drawing coordinates
as whole pixels.

Build [Fractional Motion](../examples/fractional-motion/main.pysn):

```powershell
npm.cmd run build -- examples/fractional-motion/main.pysn fractional-motion
```

Open `binary/fractional-motion.gb` in an emulator. Watch all three sprites.
The top moves every update, the middle moves one visible pixel every two updates,
and the bottom moves one visible pixel every eight updates. Press A to reset.

## Step 1: keep the small steps

Find these variables:

```python
medium_x = fixed(16)
medium_speed = 0.5
```

`medium_x` keeps a fractional part. Adding `0.5` takes it from 16 to 16.5, then
17, then 17.5. The function `advance(position, speed)` does that addition and
returns the updated position. The same helper works for all three sprites.

## Step 2: give the screen whole pixels

Find this drawing call:

```python
sprite(1, hero, 0, int(medium_x), 88)
```

`int(medium_x)` drops the fraction for drawing. The stored `medium_x` still
keeps its fraction for the next update. That is why a half-pixel step eventually
adds up to a visible pixel instead of being lost each time.

## Step 3: change the speed

Change both assignments of `medium_speed = 0.5` to `medium_speed = 0.25`.
There are two because A restores the starting speed as well as the position.
Change the middle label to say `0.25 pixels/update` and rebuild.

The middle sprite should now move one visible pixel every four updates.
It remains faster than the bottom sprite. Try `0.75` next: the average speed
becomes three pixels every four updates, although each drawing position is whole.

## Step 4: understand the limits

Pyson keeps steps of `0.0625` (one sixteenth). Values such as `0.25` and `0.75`
are exact. Other decimals round to a nearby step: `0.1` becomes `0.125`.
Keep fractional positions between -2048 and 2047.9375. Use `int(value)` for
APIs that ask for integers, including drawing, array indices, and printing.

Read the [plain-language fixed-point guide](../documentation/fixed-point.md)
for arithmetic, function defaults, negative numbers, and range limits.

[Previous: array helpers](11-array-helpers.md) · [Learning path](README.md)
