# Arrays and indexing

For numbers that never change, [constant tables](constant-tables.md) support
the same reads while keeping their elements in ROM instead of working RAM.

For elements with named fields, use [records and record arrays](records.md).
Their iteration variables and helper parameters reference the original records.

Use Python list syntax to create a fixed-size, mutable array of signed 16-bit
integers. Booleans and numeric expressions are accepted as elements:

```python
inventory = [2, 0, 5, 1]
inventory[1] = 3
inventory[0] += 1
print(inventory[0], 0, 0)
```

Multiline lists, comments, and a trailing comma are supported:

```python
enemy_x = [
    24,
    64,
    104,
]
enemy_y = [40, 72, 104]
```

## Indices and length

Indices are integer expressions, starting at zero. Negative indices count back
from the end, as in Python: `values[-1]` is the last element, and
`values[-len(values)]` is the first. `len(values)` returns the fixed element count.
It currently accepts a named array, including a qualified module variable.

```python
selected = 1
inventory[selected] += 1
last_count = inventory[-1]
slot_count = len(inventory)
```

An out-of-range literal index is a compile error. Dynamic indices are checked
at runtime before access; an invalid index displays `Index out of range` on
screen row 16 and stops the program. Empty arrays (`[]`) have length zero and
cannot be indexed. Each array may have at most 1024 elements; all arrays and
other variables must fit the available working RAM, and code/data must fit ROM.

All existing augmented integer assignments work on elements: `+=`, `-=`, `*=`,
`//=`, `%=`, `&=`, `|=`, and `^=`. Arithmetic retains signed 16-bit wrapping and
division rules. Plain indexed assignment evaluates the right-hand side before
the target; augmented assignment evaluates the target and reads its previous
value before the right-hand side. An index expression is evaluated once.

## Iteration

Read elements directly, or iterate over indices when updating them:

```python
total = 0
for count in inventory:
    total += count

for i in range(len(enemy_x)):
    enemy_x[i] += 1
```

Direct iteration reads each current element into the loop variable. Assigning
that variable does not change the array; use indexed assignment to update it.
`break` and `continue` work normally. A loop over an empty array does not execute.
As with `range`, the loop variable is not guaranteed to be assigned afterward
unless it was initialized earlier.

A named array is false when empty and true when nonempty:

```python
if inventory:
    print(inventory[-1], 0, 0)
```

`not inventory` is supported. Use `len(inventory)` in compound conditions;
`and` and `or` do not accept arrays as operands in this version.

## Scope and initialization

Arrays follow the existing variable scope rules. Module arrays persist between
calls, and all importers share one allocation:

```python
# includes/state.pysn
inventory = [2, 0, 5, 1]
```

```python
# screens/game.pysn
import includes.state as state

def collect_item(slot):
    state.inventory[slot] += 1
```

Mutating a module array's elements does not require `global`. Reinitializing a
bare module variable inside its own function does require it:

```python
# In includes/state.pysn
def reset_inventory():
    global inventory
    inventory = [2, 0, 5, 1]
```

Local arrays must be initialized before each call reads them. The compiler
reserves their storage per function; automatic memory reuse remains deferred.
Initializers execute when their assignment runs. Literal constants are stored
compactly in ROM and copied into RAM; expression initializers evaluate all
elements from left to right before overwriting the array:

```python
pair = [1, 2]
pair = [pair[1], pair[0]]  # Becomes [2, 1].
```

## Array parameters

User-defined functions can accept named integer arrays and read-only ROM tables by reference:

```python
def clear_scores(scores):
    for i in range(len(scores)):
        scores[i] = 0

player_scores = [10, 20]
enemy_scores = [30, 40, 50]
clear_scores(player_scores)
clear_scores(scores=enemy_scores)
```

Both arrays keep their original storage and length; all their elements become
zero. A parameter stores the caller's address and length in **four bytes of WRAM**,
without copying or reserving another array. The same helper supports different
lengths, including empty arrays. Type inference needs no annotations. Positional
and named calls work, and parameters can be forwarded through other helpers and
imported modules. Local arrays may be passed while their owning function runs.

`len`, indexing, indexed assignment, augmented assignment, direct iteration, and
truth testing use the actual caller's array. Negative indices count from its end.
For parameters, even literal indices are checked at runtime because callers may
have different lengths. Invalid indices display the normal source-aware error
and stop the program. Direct owner-array literal indices still receive compile-time checks.

Element writes update the caller without a `global` declaration. Two parameters
can reference the same array, so a write through either is visible through both.
An iteration variable is an integer copy; changing it does not modify the array.

Read-only helpers can receive either storage kind using the same syntax:

For a step-by-step explanation, see [passing tables to functions](constant-tables.md#passing-tables-to-functions).

```python
def total(values):
    result = 0
    for value in values:
        result += value
    return result

scores = [10, 20]
weights = constant_table([2, 4, 8])
score_total = total(scores)
weight_total = total(values=weights)
```

Pyson handles ROM bank switching automatically. A parameter that can receive a
ROM table stores its address, length, and bank in **six bytes of WRAM**; RAM-only
parameters retain four-byte storage. Table elements remain in ROM, without copies.
The same helper can read mutable arrays and tables of different lengths, including
empty ones. Indexing, negative indices, iteration, `len`, and truth tests work for both.

Passing a ROM table to a helper that writes that parameter is a compile error.
This includes augmented writes and writes through other helpers, even in branches
that might not run. Checks apply separately to each parameter: a copy helper may
write a mutable target while reading a ROM source. No annotations are required.

Pass a named integer array or table, not an inline list, scalar, or record array. Array
parameters cannot be rebound to a list or another array, returned, or saved as
ordinary array aliases. Change their elements, or explicitly copy elements in a
helper, as shown in [Array Inventory](../examples/array-inventory.pysn).

## Memory and Python differences

An array of N integers occupies **2 × N bytes of RAM**. Length is known during
compilation; there is no heap allocation or runtime list object. Reassigning a
list literal updates the same fixed storage and must preserve its length.
For example, four inventory slots occupy eight bytes. Empty arrays reserve no
element storage. Constant initializer data also occupies ROM space.

This version supports named, one-dimensional integer arrays. It does not support
strings as elements, nested lists, slicing, append/pop, resizing, comprehensions,
array aliases/copies (`other = inventory`), array returns, or printing
an entire array. Mutable integer arrays can be passed to helpers as described above.
General-purpose arrays remain one-dimensional. Static [nested tile maps](tilemaps.md)
use a separate compile-time declaration rather than mutable nested arrays.

Try the [inventory example](../examples/array-inventory.pysn):

```powershell
npm.cmd run build -- examples/array-inventory.pysn array-inventory
```

Up/Down selects a slot, A adds an item, B removes one, and Start resets the
inventory. It supports color highlighting with monochrome fallback.
