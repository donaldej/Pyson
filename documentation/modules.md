# Imports and shared state

Split reusable functions and screens into `.pysn` modules:

```python
import includes.state as state
import screens.game
from screens.title import title_screen
from includes.helpers import clamp as limit
```

Module names resolve from the directory containing the main source file.
`screens.game` means `screens/game.pysn`; package marker files are unnecessary.
The same rule applies to imports inside another module. Asset paths resolve
relative to the file declaring the asset, so an include can use
`sprite_sheet("../assets/player.bmp")`.

Modules are compiled once per module name. Dependency initializers execute
before dependent modules and the main program. Functions and variables retain
separate namespaces, so two screens can each define `update()`.
Generated assembly comments and compiler errors retain source filenames and lines.

## Shared variables

Use a dedicated state module for values that several screens need:

```python
# includes/state.pysn
score = 0
screen = 0

def reset():
    global score
    score = 0
```

```python
# screens/game.pysn
import includes.state as state

def update():
    state.score += 1
```

```python
# main.pysn
import includes.state as state
from screens.game import update
update()
print(state.score, 0, 0)
```

Qualified writes update the module's shared storage. Ordinary assignments inside
a function remain local. `global score` selects a variable in the function's
own module; declare it before reading or assigning the name. Parameters cannot
also be global. Globals require module-level initialization.

Fixed-size [integer arrays](arrays.md) can also be shared through modules.
For example, `state.inventory[slot] += 1` updates the same array seen by every
importer, without a `global` declaration for element mutation.

As a practical extension, an imported function can declare a main-owned global
when its own module does not define that name. Prefer an explicit shared-state
module when several screens use the same values.

## Reusing scratch memory

A scratch module provides shared temporary variables that routines can reuse
after the previous values are no longer needed. This uses the existing module
system and requires no special syntax:

```python
# includes/scratch.pysn
column = 0
row = 0
counter = 0
```

```python
# screens/title.pysn
import includes.scratch as scratch

def title_screen():
    scratch.column = 5
    scratch.row = 3
    print("STAR CHASE", scratch.column, scratch.row)
```

```python
# screens/game.pysn
import includes.scratch as scratch

def draw_score(score):
    scratch.column = 8
    scratch.row = 1
    print(score, scratch.column, scratch.row)
```

Both screens use the same RAM locations for `column` and `row`. Importing the
scratch module again does not allocate another copy. Each numeric variable
occupies two bytes; ten shared scratch variables therefore reserve 20 bytes.
Savings come from replacing separate temporary variables with these shared
ones. The scratch storage itself remains allocated at fixed addresses.

Assign every scratch value you need before reading it. Module initializers run
once at startup, not whenever a screen opens or a function is called. Treat the
contents as disposable between uses; retain scores, timers, selections, and
other persistent values in the appropriate state or screen module.

Only reuse a location when its previous value is no longer needed. This applies
to nested helper calls as well as screen transitions:

```python
scratch.counter = 10
draw_objects()  # If this helper writes scratch.counter, 10 is overwritten.
print(scratch.counter, 0, 0)
```

Prefer keeping scratch use within screen logic. Avoid using shared scratch
variables in helper modules unless you are completely certain that their calls
cannot clash, including nested calls, and that the calling screen is not using
the same scratch locations for values it still needs. Sequential calls may
reuse storage once the previous values are no longer needed.

Document which scratch variables each helper overwrites. If a caller must retain
a value across that helper call, keep it in a separate local or dedicated state
variable, or arrange for the helper to use different scratch storage. Using
scratch variables across mutually exclusive screens is safe only when no value
must survive the transition and their helpers follow the same rules.

The compiler does not enforce these scratch-use rules or automatically reuse
local storage. "Scratch" describes a programming convention, not a variable
type. It is distinct from "volatile", a term commonly used for values that can
change outside normal program execution. Variable types remain fixed, and this
technique does not reduce the memory reserved for graphics buffers.

## Main scaffold and screen functions

Keep the ongoing loop in main and let each screen perform one update:

```python
while True:
    wait_vblank()
    if state.screen == 0:
        title_screen()
    else:
        game_screen()
    refresh_screen()
```

The [Star Chase example](../examples/star-chase/main.pysn) demonstrates this
layout, screen transitions, reusable menu logic, and shared game state.

## Current limits

- Imports must be at the top level. Missing files, missing exports, circular
  imports, and conflicting bindings are compile errors.
- `from module import name` currently imports functions. Access variables and
  assets with `import module` and qualified names. Wildcard imports, relative
  dot imports, and dynamic imports are not supported.
- Imported modules contain functions, imports, initialization assignments,
  asset declarations, or `pass`. Put executable screen logic inside functions.
  ROM header configuration belongs in main.
- Module references are compile-time namespaces; modules are not runtime
  objects. Qualified access is limited to directly defined functions and variables.
- Existing function, integer, static-local, ROM, and graphics limits still apply.
