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
| `next_input_frame()` | None | Take the oldest recorded frame; return `1`, or `0` when none remain |
| `input_button(name)` | One literal button-name string | Held state in that recorded frame |
| `clear_input_frames()` | None | Empty recorded history and reset its lost-frame counter |
| `input_frames_lost()` | None | Number of old frames dropped since clearing, capped at 255 |

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

## Ordered input for special-move sequences

Most games should keep using `button` and `button_pressed`. A fighting game
also needs to know the order of presses and releases. If drawing takes several
frames, a player might press Back, release it, and press Forward before the
game reaches its next update. A current button sample cannot describe that
whole sequence.

The optional recorded-input routines keep one held-button sample per VBlank
while the display runs. Read them from oldest to newest:

```python
previous_a = False
presses = 0
clear_input_frames()
while True:
    wait_vblank()
    while next_input_frame():
        held_a = input_button("a")
        if held_a and not previous_a:
            presses += 1
        previous_a = held_a
```

`input_button` describes the recorded frame, while `button` still describes
the latest ordinary input sample. Recording does not change how those existing
routines behave. Extra `read_buttons()` calls do not create extra recorded
frames. Each consumed frame represents one display-frame interval, so a
sequence recognizer can advance its own clock one step per consumed frame.
After `next_input_frame()` returns zero, `input_button` returns zero too.

Ordinary programs retain the latest **64 frames**, about one second. Programs
using masked graphics instead retain **64 runs of unchanged buttons**. Each run
holds at most 255 frames; longer holds continue in another run. Reading still
returns one frame at a time, so command timing stays the same. This preserves
commands across slow redraws. Rapidly changing buttons can still fill either
queue. When full, the oldest frames are dropped and `input_frames_lost()`
increases, up to 255. A
sequence recognizer should reset its partial command and call
`clear_input_frames()` if that counter is nonzero. Clear history when entering
a match or resuming from a menu, so menu input cannot become a fighting move.
Also reset any previous-button values maintained by your own recognizer.

The compiler includes the queue only when these routines are used. Ordinary
programs use 69 bytes of working RAM; masked programs use 133 bytes (64 pairs
of button state and duration, plus five bookkeeping bytes), alongside the
frame clock and buffered button state. No additional tools are required.

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
frame counter; ordinary input still requires sampling. Pyson does not expose
user interrupt callbacks. The optional ordered history above and the automatic
graphics buffering below can retain input between ordinary samples.

The complete [button-counter example](../examples/button-counter.pysn) adds B
to decrement and Start to reset, and uses a function for the arithmetic.
Build it with:

```powershell
npm.cmd run build -- examples/button-counter.pysn button-counter
```

Open `binary/button-counter.gb` in an emulator and map its controls to the
Game Boy A, B, and Start buttons.

## Input during large redraws

Programs using masked layers, exclusive screen images, or the combination of
`actor_sheet()` and `background_clip()` can take several frames to prepare a picture. Pyson automatically remembers button presses during
that work. A quick tap therefore reaches the next input sample instead of being
lost. A combination such as Down+B is retained for that sample even if you have
already released it. The following sample returns to the current held state.
Holding a button still produces just one pressed event.

Use the normal input routines; no extra setup is needed. `wait_frames()` also
updates the input sample when it returns. Do not immediately sample again before
checking `button_pressed()`, because that replaces the snapshot. Sampling consumes
buffered presses; querying `button_pressed()` does not.

This stores pending presses and combinations, not a complete ordered history.
Several presses of the same button between updates become one event. Programs
without these graphics modes retain their existing sampling behavior.

Exclusive image uploads also sample input while the display is stopped, so a
short Start press during a screen transition can reach the next normal input
sample. This does not make the upload instantaneous.
