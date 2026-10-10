# 10. Reusable text helpers

Goal: reuse screen and dialogue routines with different text, using ordinary
function parameters rather than duplicating drawing instructions.

Build [Dialogue Garden](../examples/dialogue-garden/main.pysn):

```powershell
npm.cmd run build -- examples/dialogue-garden/main.pysn dialogue-garden
```

The existing controls still work: A opens conversations, B closes them, and
Select changes text speed. Locate this function:

```python
def open_message(text, delay=2):
    start_dialogue(text, speed=delay, palette=1)
```

`text` is a string parameter. The compiler learns its type from calls such as
`open_message(text=messages.intro, delay=delay)`. The `talk()` helper selects an
imported message, then forwards it. Neither function needs to know assembly
addresses or copy characters. A required string parameter can sit alongside
integer parameters and their numeric defaults.

## Step 1: supply your own message

In a copy of the example, replace the first `open_message` call inside `talk`
with:

```python
open_message("HELLO FROM A HELPER", delay=delay)
```

Rebuild. The opening conversation should display your message while retaining
the selected text speed. Restore the imported message afterward.

You can also assign a string variable and pass it, or forward the parameter to
another helper. Positional and named calls work; the public name in this function
is `text` because that is the name in its `def` declaration.

## Step 2: format a changing value

Replace the same call with:

```python
open_message(format_text("CONVERSATIONS {}", completed), delay=delay)
```

`completed` is already initialized in the example. Rebuild, finish a conversation,
and return to this message to observe the count. Open text on an event rather
than repeatedly restarting it every frame.

`format_text()` uses one shared temporary buffer. A string parameter references
that buffer; it does not save a separate copy. Another formatting call overwrites
it. Consume the formatted value first, and avoid formatting unrelated HUD text
while an active dialogue still depends on that buffer. Literal/imported messages
are stored in ROM and do not have this restriction.

## Step 3: keep types consistent

Each parameter has one fixed type across the program. Calling this text helper
with an integer is a compile error. String parameters can be used for printing,
window text, dialogue, local aliases, and forwarding. They do not add string
concatenation, character indexing, string returns, or string defaults.

Each parameter stores a two-byte reference, irrespective of message length.
Changing a local reference does not replace the caller's string variable.

References: [string parameters](../documentation/functions.md#string-parameters),
[formatted text](../documentation/dialogue.md), [modules](../documentation/modules.md).

[Previous: readable calls](09-readable-calls.md) · [Next: array helpers](11-array-helpers.md)
