# Paged dialogue and typewriter text

Dialogue displays one bordered text box in the bottom 48 pixels of the screen.
It wraps words across four lines of 18 characters and creates more pages as
needed. Text can appear gradually or instantly.

```python
start_dialogue("WELCOME! PRESS A TO CONTINUE.", speed=2, palette=0)
while True:
    wait_vblank()
    # Movement, animation, music, and other game logic can continue here.
    update_dialogue()
    if dialogue_finished():
        # Advance your story or screen state here.
        pass
    refresh_screen()
```

There is no blocking dialogue loop inside the runtime. Call `update_dialogue()`
once per game update after polling input with `wait_vblank()` or `read_buttons()`.
Call `refresh_screen()` to display the queued changes. Omitting updates pauses
the dialogue; omitting refresh leaves the hardware display unchanged.

## Calls and options

| Call | Behavior |
| --- | --- |
| `start_dialogue(text, speed=2, palette=0)` | Replace any existing dialogue and open its first page. |
| `update_dialogue()` | Reveal text and process A/Start input. |
| `close_dialogue()` | Cancel and hide the box; clear completion status. |
| `dialogue_active()` | `1` while the conversation remains open, otherwise `0`. |
| `dialogue_waiting()` | `1` when the current page is fully revealed and awaits confirmation. |
| `dialogue_finished()` | `1` after the player confirms the final page. |

Text must be a string literal or string-valued expression, such as a module
variable or a `format_text()` result. It uses the existing font and escape rules.
Python f-strings and Unicode are not implemented. [String parameters](functions.md#string-parameters)
can pass text through user-defined dialogue helpers.

`speed` is an integer from 0 through 255. A value of 2 reveals one character
every two calls to `update_dialogue()`; 1 reveals one per call, and 0 reveals the
whole current page in one call. The first character appears on the first update.
Timing counts game updates, rather than guaranteeing a particular hardware frame
rate. Changing a variable passed as speed does not change an already open box.

`palette` is a background palette index from 0 through 7. Use `bg_palette()` to
configure its colors. Both options accept positional or named arguments and
runtime integer expressions. Argument expressions are evaluated left to right,
including named options.
Invalid literal ranges fail compilation; invalid
runtime ranges make `start_dialogue()` leave the current conversation untouched.

## Reading and completion

While text is appearing, pressing A or Start reveals the rest of that page.
When a page is fully visible, the next press advances to the next page or closes
the final page. Holding the button does not skip multiple pages. The press that
opens a conversation is ignored by its first update.

A `>` marker appears on the bottom border while waiting. `dialogue_finished()`
becomes true only after final confirmation, not merely after revealing the final
text. It stays true until another dialogue starts or `close_dialogue()` is called.
Use a transition or other guard when applying one-time story changes.

`close_dialogue()` cancels without reporting completion. Starting a new dialogue
replaces the previous text, clears completion, and starts from its first page.

## Wrapping and pages

Whole words wrap when they do not fit the remaining columns. Words longer than
18 characters start on a fresh line when necessary and split across lines.
Leading spaces on a new line are skipped. Explicit `\n` advances a line; after
the fourth line it advances to a new page when confirmed. Trailing spaces or an
exactly full final line do not create an extra page. Blank lines are retained.

The box has fixed dimensions and position. Localization and inline formatting
codes remain future features.

[Dialogue choices](choices.md) provide branching menus in the same box.

## Window ownership and storage

Dialogue uses the existing [window layer](window.md), with its origin at `(0, 96)`.
The border occupies rows 0 and 5 and columns 0 and 19. Text uses rows 1–4 and
columns 1–18. Backgrounds and sprites above the box continue to render normally.

Opening a box replaces the six rows used by the box, sets its position, and shows it. Closing
hides it. Previous HUD text, position, and visibility are not saved or restored;
your screen code should redraw its HUD afterward. Avoid writing window text or
changing its position while dialogue is active. Ordinary background `print()`
and sprite drawing remain independent.

Dialogue adds 13 bytes of state, plus the existing window buffers and state when
those were not already enabled. Text and runtime code live in ROM. Dialogue code
and state are omitted from games that do not use its routines. The build's memory
report includes these allocations.

## Playable example

```powershell
npm.cmd run build -- examples/dialogue-garden/main.pysn dialogue-garden
```

Open `binary/dialogue-garden.gb` on DMG or Color. D-pad moves, A or Start reveals
and advances text, A opens another conversation after closing, and B cancels.
Select cycles speed 2, 4, and 0 for the next conversation. A robot patrols and
music continues while you read. The `DONE` counter increments only for completed
conversations.

## Formatted text, speakers, and portraits

`format_text("SCORE {} / {}", score, goal)` substitutes up to four integers into
literal `{}` placeholders and returns a string pointer usable by `print`,
`print_window`, or `start_dialogue`. Double braces represent literal braces.
Placeholder counts must match the values; expressions evaluate left to right.
Newlines are supported. Output truncates at 255 glyphs and is terminated safely.

Formatting uses one shared 256-byte buffer. String variables receiving its result
alias that buffer; another formatting call changes those aliases. `start_dialogue`
copies a formatted result into its own 256-byte snapshot, so later HUD formatting
does not change active text. Long ordinary ROM strings retain existing pagination.

```python
face = sprite_sheet("assets/portrait.bmp", 16, 16)
start_dialogue(format_text("YOU HAVE {} COINS.", coins), palette=1)
dialogue_speaker("SHOPKEEPER")
dialogue_portrait(face, 0, 1)
```

Configure a portrait immediately after opening text and before updating it.
`dialogue_speaker(name)` writes a literal single-line name of 1–14 characters on
the top border. `dialogue_portrait(sheet, frame=0, palette=0)` takes positional or [named](arguments.md)
arguments and requires a 16×16 sprite-sheet frame. The palette is a **background**
palette slot. Sprite transparency index zero renders as that palette's color zero
because the portrait uses background tiles rather than OAM sprites.

Portraits reserve columns 1–3, leaving text columns 4–18 for all four rows. They
persist across pages and reset for each new box. Invalid portrait arguments or
calls after text has started are ignored. Portraits are not supported in choices.
Speaker/portrait support adds seven shared bytes; formatting adds 257 bytes and,
when dialogue is also used, its 256-byte snapshot. Both runtimes are conditional.

Completing text now opens a [choice menu](choices.md). Up/Down highlight a branch,
A or Start selects it, and B cancels. The four options offer a garden story,
instructions, a speed change, or goodbye. Player movement pauses while choosing;
the robot and music keep running. `CHOICE` shows the last confirmed index.
