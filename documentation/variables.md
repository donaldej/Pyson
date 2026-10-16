# Variables and expressions

Assignments create variables and later assignments update their stored values:

```python
score = 0
score = score + 1
score += 10
message = "Hello!"
print(message, 0, 0)
print(score, 0, 1)
```

Module variables retain their values across loop iterations. Function variables
have local scope; see [functions](functions.md).

For manual reuse of temporary RAM across routines and screens, see
[scratch memory using modules](modules.md#reusing-scratch-memory).

## Types and integer limits

Variables have fixed inferred types. Basic values include integers, fixed-point numbers, strings,
and integer arrays; [records](records.md), [pools and handles](pools.md), and
feature-specific definitions have additional type rules. A variable cannot
change from an integer to a string or vice versa. Every numeric variable uses
two bytes in Game Boy working RAM. String
variables hold references to text: literals live in ROM, while `format_text()`
uses a shared temporary buffer. Strings can be passed to [function parameters](functions.md#string-parameters).
Integer arrays reserve two bytes per element; see [arrays and indexing](arrays.md).

Integers are signed 16-bit values, from **-32768 through 32767**. Literals outside
that range are rejected. Arithmetic wraps using two's complement:

```python
value = 32767
value += 1              # value becomes -32768
```

For fractions such as `0.5`, use [fixed-point numbers](fixed-point.md). They keep
steps of 1/16 within a smaller range, using the same two bytes per variable.
If a numeric variable receives a fractional value, its type is inferred as
fixed-point throughout the program. Other type changes remain unsupported.

This differs from Python's unlimited integers. There are no general floating-point
numbers or explicit 8-bit variable types yet. Use decimal integer literals;
hexadecimal, binary, and underscore-separated literals are not supported yet.

`True` and `False` behave as integers `1` and `0`. Comparisons and `not` also
produce `1` or `0`. They are valid conditions, and `print` displays them as
numbers. Numeric zero and an empty string are false; other supported values
are true.

## Operators

| Operators | Behavior |
| --- | --- |
| `+`, `-`, `*` | Integer addition, subtraction, multiplication |
| `//` | Integer division rounded toward negative infinity |
| `/` | Fractional division when at least one operand is fixed-point |
| `%` | Remainder with the divisor's sign |
| Unary `+`, unary `-` | Integer identity and negation |
| `&`, `|`, `^`, `~` | Bitwise AND, OR, XOR, and complement |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | Signed numeric comparisons |
| `not`, `and`, `or` | Boolean negation and short-circuit expressions |

Operator precedence follows Python for this supported subset. Parentheses
override precedence. Comparison chains work, evaluate each operand once, and
stop as soon as a comparison is false:

```python
inside = 0 <= score < 100
result = 1 + 2 * 3      # 7
quotient = -7 // 3      # -3
remainder = -7 % 3      # 2
```

`and` and `or` return an operand, as in Python. Both operands must have the same
fixed type. Short-circuiting avoids evaluating an unnecessary operand:

```python
divisor = 0
safe = divisor != 0 and 10 // divisor > 1
label = "" or "Default"
```

Literal division by zero is a compile error. Division by a variable that is
zero at runtime displays `Division by zero` on row 16 and stops the program.
The result of `-32768 // -1` wraps to `-32768` under the 16-bit integer rules.

Augmented assignments are supported for `+=`, `-=`, `*=`, `//=`, `%=`, `&=`,
`|=`, and `^=`. They require the variable to have already been assigned.

String concatenation, string comparison, string indexing, integer-only `/`, powers, shifts,
dictionaries, resizable collections, and multiple assignment are not supported yet.

## Assignment checks

Variables must be assigned before use. The compiler checks all possible paths
conservatively. A variable initialized only in an `if` without `else`, or only
inside a loop that might not run, cannot be read afterward unless it was
initialized earlier.

```python
value = 0
if button("a"):
    value = 1
print(value, 0, 0)
```

Names are case-sensitive. Built-in routine names, function names, and button
constants cannot be reused as variable names. Errors include the source
filename and line information when available.
