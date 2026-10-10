# Dialogue choices

`start_choices(labels, palette=0, selected_palette=0, default=0, cancel=True)`
opens a menu in the dialogue box. Supply a literal list of one to four literal
strings, each containing 1–16 characters on one line. Labels cannot be blank.
Palette slots range from 0 to 7; `default` is a zero-based option index.
On monochrome systems the arrow still identifies the selection.

```python
start_choices(["TALK", "LEAVE"], palette=1, selected_palette=2)
while choices_active():
    wait_vblank()
    update_dialogue()
    refresh_screen()
if choices_finished():
    if choices_result() == 0:
        start_dialogue("Hello!")
```

Call `update_dialogue()` once per game update and `refresh_screen()` to display
changes. Up and Down move the highlight, wrapping at either end. A or Start
confirms. B cancels when `cancel` is true. Holding a button does not repeat an
action; the opening button press is ignored. Other game logic can keep running.

| Query | Result |
| --- | --- |
| `choices_active()` | True while the menu is open |
| `choices_selected()` | Current or last highlighted index; -1 outside choice mode |
| `choices_finished()` | True after confirmation |
| `choices_result()` | Confirmed index; -1 before confirmation or after cancellation |
| `choices_cancelled()` | True after cancellation |

Results persist until another menu or ordinary dialogue replaces them.
`close_dialogue()` cancels an active menu even with `cancel=False`; closing an
already inactive menu clears its results. Dynamic invalid palette or default
values leave the existing box unchanged; invalid literals fail compilation.

Menus share the [dialogue](dialogue.md) window. `dialogue_active()` and
`dialogue_waiting()` also return true for an open menu, and `dialogue_finished()`
becomes true when it is confirmed. Use the choice queries to distinguish menus
from text. Opening a menu replaces the current box; previous HUD contents are
not restored. Choices add 10 bytes of state to dialogue, with labels and pointer
tables in ROM. Their runtime and state are included only when used.

The `dialogue-garden` example offers four branches after each completed text:
another story, instructions, a speed change, or goodbye. Up/Down highlight an
option, A selects, and B cancels. Player movement pauses during menus; the robot
and music continue.
