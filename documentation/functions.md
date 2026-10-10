# Functions

Define a function with Python-style `def`, parameters, and `return`:

```python
def change(value, amount):
    result = value + amount
    return result

score = 0
score = change(score, 1)
print(score, 0, 0)
```

Functions accept integers, fixed-point numbers, strings, integer arrays (including ROM tables), records, or pool handles and return an
integer or fixed-point number. Arguments are evaluated from left to right. Calls can be nested in
expressions. Integer parameters use the same signed 16-bit rules as other
integer variables; fixed-point parameters use their documented range and precision.

For fractional movement, functions can receive and return [fixed-point numbers](fixed-point.md),
including decimal defaults such as `speed=0.5`. Integer arguments can be converted
to that parameter's fractional type automatically; keep them within its range.
If any return value is fixed-point, numeric returns from that function use fixed-point.

[Record parameters](records.md) reference the caller's storage, so field updates
persist. Their field schema is fixed across calls; record returns are unsupported.
[Pool handles](pools.md) can also be passed to helpers. Their identities are copied
and checked on field access; each parameter belongs to one specific pool.

`return expression` immediately leaves the function with that value. A bare
`return`, or reaching the end without returning, produces `0`. This is a
practical difference from Python's `None`; `None` is not implemented yet.
String parameters are supported; string return values are not.
[Array parameters](arrays.md#array-parameters) reference the caller's storage,
include its length, and support reusable helpers without copying elements.
Read-only helpers accept mutable arrays and `constant_table` values; passing
a ROM table to a helper that modifies that parameter is a compile error.

## String parameters

Use ordinary parameters to make reusable text helpers. The compiler infers each
parameter's fixed type from its call sites, including calls through other helpers
and imported modules. No type annotations are needed.

```python
def show_message(text, palette=0):
    clear_window()
    print_window(text, x=1, y=1, palette=palette)
    show_window()

show_message("LEVEL COMPLETE")
show_message(text="TRY AGAIN", palette=2)
show_message(format_text("SCORE {}", score))
```

The last call assumes an initialized integer `score`. String literals, string
variables, qualified module strings, and `format_text()` results can be passed.
Helpers may forward strings to other helpers, assign local string aliases, and
use them with `print`, `print_window`, or `start_dialogue`. Named and positional
calls follow the same argument rules. Reassigning a parameter to another string
changes only that function's reference, not the caller's variable.

Each string parameter uses two bytes of WRAM for a text reference. Literal text
remains in ROM and identical literals are shared. One parameter cannot alternate
between strings and integers across calls. Existing string limitations still
apply: no concatenation, indexing, comparison, mutation, or string returns.
User-function defaults can be compile-time integers, fixed-point numbers, or booleans; string defaults
are not supported. Use required parameters for text.
Parameters are runtime expressions, so literal-only built-ins retain their
restrictions: `dialogue_speaker()` still needs a literal name, and `format_text()`
still needs a literal template. A string parameter cannot stand in for those literals.

`format_text()` returns a reference to one shared temporary buffer. Passing it
does not make a snapshot: another formatting call replaces its contents. Consume
formatted text before formatting another value. Avoid passing two separate
`format_text()` results to the same call when both need to retain their contents.
Literal strings do not have this temporary-buffer restriction.

See [Dialogue Garden](../examples/dialogue-garden/main.pysn) and
[the text-helper tutorial](../tutorials/10-text-helpers.md).

## Scope

Parameters and names assigned anywhere inside a function are local to that
function. Local strings are supported for printing. Locals do not overwrite
module variables with the same name and are not visible outside the function.
Each local must be assigned on every path before it is read on that call.

```python
offset = 10

def adjust(value):
    result = value + offset  # Read a module variable.
    return result

score = adjust(5)            # 15
```

Functions may read module variables. The compiler checks that the required
module variables are assigned before the call, including requirements from
functions called indirectly. Assigning a name inside a function makes it local
unless declared `global` before use or assignment:

```python
score = 0
def add_point():
    global score
    score += 1
```

Global variables must have a module-level initializer. Qualified assignments
such as `state.score += 1` update an imported module without a `global`
declaration. See [modules](modules.md) for shared state and reusable functions.
`nonlocal` is not supported.

## Practical limits

Function definitions must be at the module's top level. The compiler collects
all definitions before emitting the program, so forward calls are allowed.
Definitions cannot be conditional or nested.

Local storage is allocated per function in working RAM. Recursion, including
indirect recursion, is rejected so calls cannot overwrite an active function's
locals. Ordinary repeated calls and nested argument calls such as
`add(1, add(2, 3))` are supported.

Type annotations, closures, decorators,
first-class functions, and methods are not supported yet. Fixed-parameter
built-ins accept [named arguments](arguments.md) using their public parameter
names. User-defined functions take positional or keyword integers, fixed-point numbers, strings, arrays or ROM tables, records, or pool handles as
arguments. Animation definitions are shared through modules, and helpers can
accept numeric playback slots. Function names cannot
duplicate built-ins or be used as variable names.

Functions are placed automatically into ROM banks and called through a routine
that restores the caller's bank. Shared state and local WRAM allocation are
unchanged. See [ROM banking](banking.md) for capacity and runtime costs.

## Default and keyword arguments

```python
def damage(amount, multiplier=1):
    return amount * multiplier

normal = damage(5)
critical = damage(multiplier=2, amount=5)
```

Defaults must be compile-time signed integers, fixed-point numbers, or booleans (including constant
expressions). Required parameters must come before defaulted parameters. Defaults
are evaluated at compilation rather than Python's runtime definition step; mutable
defaults and record/handle defaults are unsupported.

Positional arguments precede keywords. Keywords name parameters, with duplicate,
unknown, excess, or missing arguments rejected. Explicit expressions evaluate
once in written order, even when keyword order differs from parameter order.
Keywords also work for string, array, record, and pool-handle parameters; their existing fixed
type restrictions remain. Static parameters are written only after all argument
expressions finish, retaining nested-call behavior.
