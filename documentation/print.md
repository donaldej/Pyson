# print

`print` draws text on the Game Boy screen using the built-in font:

```python
print("Hello World!", 4, 8)
```

## Arguments

```python
print(value, x, y, palette=0)
```

| Argument | Accepted value | Meaning | Default |
| --- | --- | --- | --- |
| `value` | A string or integer expression | Text or a decimal number to draw | None; required |
| `x` | An integer expression with a value from `0` to `19` | Starting column, from left to right | None; required |
| `y` | An integer expression with a value from `0` to `17` | Starting row, from top to bottom | None; required |

Each character occupies an 8×8 pixel tile. The screen is 20 columns by 18 rows
(160×144 pixels). Coordinates are tile positions, not pixel positions:

| Position | Coordinates |
| --- | --- |
| Top-left tile | `(0, 0)` |
| Top-right tile | `(19, 0)` |
| Bottom-left tile | `(0, 17)` |
| Bottom-right tile | `(19, 17)` |

The first three parameters are required. The optional `palette` parameter
selects background palette 0..7 on Color hardware (default 0). Variables and
expressions are supported. All four parameters accept [named arguments](arguments.md),
for example `print("SCORE", x=1, y=0, palette=2)`. The first parameter's name is
`value`; Python's console-style `sep` / `end` options are unsupported.
Integers are printed in decimal with a minus sign when negative. Booleans and
comparison results are represented as integers and print as `0` or `1`.

```python
score = 100
column = 7
print("Score:", 0, 8)
print(score + 1, column, 8)
```

## Characters and strings

The font supports all 95 printable ASCII characters: uppercase and lowercase
letters, digits, spaces, and ASCII punctuation. Letter case is preserved.
Unicode characters such as accented letters and emoji are compile errors,
including when they occur in text that would be clipped off-screen.

Single and double quotes both work:

```python
print('Hello!', 0, 0)
print("It's working!", 0, 1)
print('Say "hello"', 0, 2)
```

| Escape | Effect |
| --- | --- |
| `\n` | Start a new line on the next row at the original starting column |
| `\\` | Print a backslash |
| `\'` | Print a single quote |
| `\"` | Print a double quote |

The string parser also recognizes `\t` and `\r`, but the text routine cannot
display tabs or carriage returns, so strings containing them are rejected.
Other escape sequences are not supported. Use `\n` inside a string instead of
placing an actual source newline between the quotes.

## Line breaks and screen edges

```python
print("Line one\nLine two", 3, 5)
```

This draws `Line one` at `(3, 5)` and `Line two` at `(3, 6)`. A blank line
advances the row without drawing or clearing text there.

Text clips at the right and bottom edges. It does not automatically wrap or
scroll. Off-screen literal starting coordinates are compile errors. When a
variable or calculated coordinate is outside the visible screen, that call
draws nothing; the program continues running.

```python
print("ABCD", 18, 0)     # Only AB is visible.
print("A\nB", 0, 17)    # Only A is visible; B is below the screen.
print("", 0, 0)         # Does nothing.
```

## Overwriting text

Calls execute in source order. Later calls replace the tiles they touch without
clearing the rest of the row:

```python
print("HELLO", 0, 0)
print("HI", 0, 0)       # The row now reads HILLO.
print("     ", 0, 0)    # Five spaces erase those five characters.
```

The background starts blank. Calls update a drawing buffer; call `refresh_screen()`
to display queued changes together. `wait_vblank()` alone does not draw them.
Programs that reach their end refresh the screen automatically once.

Font backgrounds use palette color 0 and letters use color 3. Configure colors
with `bg_palette`; see [graphics](graphics.md). Original hardware uses grayscale.

## Complete example

```python
header.title = "TEXT DEMO"
header.target = "dmg"

print("Top left", 0, 0)
print("Hello World!", 4, 8)
print("Line 1\nLine 2", 5, 11)
print("Bottom right", 8, 17)
```

Save this as `examples/text-demo.pysn`, then build it:

```powershell
npm.cmd run build -- examples/text-demo.pysn text-demo
```

Open `binary/text-demo.gb` in an emulator. Generated assembly is available at
`build/text-demo.asm`.

## Current scope

`print` draws background tiles with a fixed font. Custom fonts and pixel-based
text placement are not implemented. Background text can scroll with the camera;
use `print_window` for fixed text. For multiple numbers in a string, use
[format_text](dialogue.md#formatted-text-speakers-and-portraits). It uses a shared
buffer, so later formatting overwrites earlier aliases. Calls work in loops and functions.
Shorter numbers leave trailing characters; erase fields with spaces first.
Refresh the screen once after updating the frame. Large updates may take extra frames to
prepare, but the visible background changes together at VBlank.

See [graphics](graphics.md), [header configuration](header.md), and [input](input.md).

Use [print_window](window.md) to place text on a fixed window HUD while the
background camera scrolls. It uses the same font and formatting, with coordinates
relative to the window.
