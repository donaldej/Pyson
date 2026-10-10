# 11. Reusable array helpers

Goal: let one function work with different arrays while changing the caller's
original elements.

Build [Array Inventory](../examples/array-inventory.pysn):

```powershell
npm.cmd run build -- examples/array-inventory.pysn array-inventory
```

Use Up/Down to select a slot, A to add, B to remove, and Start to reset.
The example declares a mutable inventory and a read-only ROM table of initial values.
Find the reset helper:

```python
def copy_items(target, source):
    if len(target) != len(source):
        return 0
    for i in range(len(target)):
        target[i] = source[i]
    return 1
```

`target` is the list that receives the changes. `source` is the list to read from.
Passing a list gives the helper access to that original list; it does not create
a second list. This function copies each number from the source into the target.
The source stays unchanged. If the lengths differ, it returns zero before
changing anything.

The Start action calls:

```python
copy_items(target=inventory, source=initial_inventory)
```

No `global` declaration is needed: the helper writes through its parameter to
the caller's storage. Named arguments clarify which array receives the writes.

For more small examples, including why a function can read a ROM table but
cannot change it, see [passing tables to functions](../documentation/constant-tables.md#passing-tables-to-functions).

## Step 1: change the reset values

In a copy of the example, change `initial_inventory` to `constant_table([9, 8, 7, 6])`.
Rebuild. Startup still shows the separate inventory's original values; pressing
Start now restores your new values. Both arrays remain four elements long.

## Step 2: make another reusable helper

Add this function at module level, before the game loop:

```python
def clear_items(values):
    for i in range(len(values)):
        values[i] = 0
```

Replace the reset call with `clear_items(inventory)`. After rebuilding, pressing
Start should empty every slot. This helper also works with arrays of different
lengths, including an empty array, because `len(values)` reads the caller's length.

## Step 3: understand references and bounds

RAM-only parameters store an address and length using four bytes of working RAM.
A parameter that can receive a ROM table uses six bytes, including its bank.
In `copy_items`, `target` uses four bytes and `source` uses six. The initial values
stay in ROM and occupy no element storage in RAM. Bank switching is automatic.
The array itself still occupies its original allocation. Two parameters may
reference the same array; writes through one are visible through the other.

Negative indices work: `values[-1]` means the final element. Bounds checks use
the current caller's length. Indexing an empty array is an error, even though
looping over it safely performs zero iterations. Iterating `for item in values`
copies each integer into `item`; assigning `item` does not modify the array.

Pass named integer arrays or `constant_table` values. A read-only helper such as
one that totals its elements can accept either. A writing helper such as
`clear_items` can only receive mutable arrays: `clear_items(initial_inventory)`
is a compile error. The compiler also checks writes through other helpers.
Inline lists are unsupported. The parameters cannot be rebound or returned,
and arrays do not gain resizing, slicing, or ordinary assignment aliases.

References: [arrays and parameters](../documentation/arrays.md#array-parameters),
[functions](../documentation/functions.md), [ROM tables](../documentation/constant-tables.md).

[Previous: text helpers](10-text-helpers.md) · [Next: fractional movement](12-fractional-movement.md) · [Learning path](README.md)
