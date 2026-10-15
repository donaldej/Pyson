# 1. Your first interactive program

Goal: build a ROM, draw text, and change persistent state from button input.

## Step 1: see the smallest program

Open [Hello World's source](../examples/hello-world/main.pysn), then build:

```powershell
npm.cmd run build -- examples/hello-world/main.pysn hello-world
```

Open `binary/hello-world.gb`. `print` draws text using tile coordinates, not
pixels. The visible screen has 20 columns and 18 rows; `(0, 0)` is the top left.
The compiler supplies a font, header, and startup code. You do not need ASM.

The build also writes `build/hello-world.report.txt`. Open it in any text editor
to see memory use. As you add graphics, the same report shows tile and sprite
costs; no extra tools or changes to your program are needed. See
[reading build reports](../documentation/build-reports.md).

Change the message in a copy and rebuild. The displayed text should change.
Use printable ASCII; Unicode artwork and emoji are not font characters.

## Step 2: make state respond to input

Open [Button Counter](../examples/button-counter.pysn):

```powershell
npm.cmd run build -- examples/button-counter.pysn button-counter
```

Press A to add one, B to subtract one, and Start to reset. Find these parts:

```python
count = 0
previous = -1
```

Assignments reserve variables whose values persist across loop iterations.
Numbers are signed 16-bit integers; unlike Python, arithmetic wraps outside
-32768..32767.

The loop begins with `wait_vblank()`, which waits for a fresh display frame and
samples input. This branch responds to a new press:

```python
if button_pressed("a"):
    count = change(count, 1)
```

`button_pressed` represents an edge. `button("a")` instead stays true while A is
held. `change` is an ordinary user function returning an integer.

## Step 3: separate state from drawing

The example redraws the number only when `count != previous`. It first writes
spaces to erase the old number. Otherwise changing 100 to 9 could leave `900`.
It then calls `refresh_screen()` to display queued drawing.

A useful loop is: sample input, update state, queue drawing, refresh. A refresh
does not sample buttons. An explicit wait plus a refresh that also waits can
consume multiple display frames; do not assume this loop means 60 updates/sec.

## Try it

In a copy, change the A increment from 1 to 5. A fresh press should add five.
Then replace `button_pressed("a")` with `button("a")`. Holding A should now
increase repeatedly. Restore the press-only version before continuing.

References: [text](../documentation/print.md),
[variables](../documentation/variables.md), [input](../documentation/input.md),
[functions](../documentation/functions.md).

[Next: sprites and animation](02-sprites-animation.md)
