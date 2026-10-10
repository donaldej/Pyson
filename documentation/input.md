# Input and frame timing

Use `wait_vblank()` in a game loop to wait for a fresh frame boundary and sample
the buttons. Read that sample with `button` or `button_pressed`:

```python
count = 0

while True:
    wait_vblank()

    if button_pressed("a"):
        count += 1

    if button_pressed("start"):
        count = 0
```

## Routines

| Routine | Arguments | Result / behavior |
| --- | --- | --- |
| `wait_vblank()` | None | Wait for a fresh VBlank, then update the input sample. Use as a statement. |
| `button(name)` | One literal button-name string | `1` while that button is held in the latest sample, otherwise `0` |
| `button_pressed(name)` | One literal button-name string | `1` if the button changed from released to held in the latest sample, otherwise `0` |
| `read_buttons()` | None | Sample input immediately and return a bitmask of held buttons |

Button names are `"right"`, `"left"`, `"up"`, `"down"`, `"a"`, `"b"`,
`"select"`, and `"start"`. Button-name strings are case-insensitive, so `"A"`
also works. They must be literals rather than variables. Simultaneous buttons
are supported.

Held state remains true on each sample while the button is down. Pressed state
is true for the sample containing a new press; holding the button does not
repeat it. Reading `button_pressed` does not consume the result.

Input is sampled once at startup. `button` and `button_pressed` read cached
state and do not poll hardware themselves. Both `wait_vblank` and
`read_buttons` create a new sample. Calling `read_buttons` immediately after
`wait_vblank` replaces the pressed state with a second sample, so normally use
one sampling routine per iteration.

## Button masks

Use the constants below with the bitwise operators for lower-level input:

| Constant | Decimal value |
| --- | --- |
| `BUTTON_RIGHT` | 1 |
| `BUTTON_LEFT` | 2 |
| `BUTTON_UP` | 4 |
| `BUTTON_DOWN` | 8 |
| `BUTTON_A` | 16 |
| `BUTTON_B` | 32 |
| `BUTTON_SELECT` | 64 |
| `BUTTON_START` | 128 |

```python
buttons = read_buttons()
if buttons & BUTTON_A:
    print("A is held", 0, 0)
```

Button routines accept a positional name or `name="a"`; see [named arguments](arguments.md). Unknown button names or unexpected
arguments are compile errors.

## Drawing changing values

`print` queues changes until `refresh_screen()`. Refresh the screen once after drawing your frame.
`refresh_screen()` waits for VBlank but does not sample input; `wait_vblank()` samples
input but does not flush drawing. Using both can consume additional frames,
and large background updates may take longer to prepare. Redraw only changed
values when practical:

```python
count = 0
previous = -1

while True:
    wait_vblank()
    if button_pressed("a"):
        count += 1

    if count != previous:
        print("      ", 7, 8)
        print(count, 7, 8)
        previous = count
    refresh_screen()
```

Fast press/release events occurring entirely between samples may be missed.
Without the optional [hardware frame timing helpers](frame-timing.md), frame
timing uses polling with interrupts disabled. The helpers enable an internal
frame counter; input still requires sampling. There are no user interrupt
callbacks or background input updates.

The complete [button-counter example](../examples/button-counter.pysn) adds B
to decrement and Start to reset, and uses a function for the arithmetic.
Build it with:

```powershell
npm.cmd run build -- examples/button-counter.pysn button-counter
```

Open `binary/button-counter.gb` in an emulator and map its controls to the
Game Boy A, B, and Start buttons.
