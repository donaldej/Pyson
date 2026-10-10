# Conditionals and loops

For iteration over fixed-size integer arrays, see
[arrays and indexing](arrays.md#iteration). Both `for value in values` and
`for i in range(len(values))` are supported.

Blocks use a colon and indentation, following Python. Use spaces for
indentation; four spaces per level is recommended. Blank lines and comment-only
lines do not affect a block. Inconsistent indentation and tabs in indentation
are errors. Multiline expressions are allowed inside parentheses.

## if, elif, else

```python
if score > 10:
    print("High", 0, 0)
elif score > 0:
    print("Low", 0, 0)
else:
    print("Zero", 0, 0)
```

Only the first matching branch runs. `elif` and `else` are optional. Numeric
zero and an empty string are false. See [variables](variables.md) for comparisons
and short-circuit operators.

## while

```python
count = 0
while count < 5:
    count += 1
print(count, 0, 0)
```

The condition is evaluated before each iteration. `while True:` is useful for
a game loop; include `wait_vblank()` to pace updates and sample input.

## for and range

```python
total = 0
for i in range(5):
    total += i          # i is 0, 1, 2, 3, 4
```

| Form | Values produced |
| --- | --- |
| `range(stop)` | Start at 0, increase by 1, exclude stop |
| `range(start, stop)` | Start at start, increase by 1, exclude stop |
| `range(start, stop, step)` | Start at start, move by step, exclude stop |

Start and stop may be integer expressions and are evaluated once when the
loop begins. Step must be a nonzero signed 16-bit integer literal, optionally
preceded by unary `+` or `-`. Negative steps count downward:

```python
for i in range(5, -1, -1):
    print(i, i, 0)
```

An empty range runs zero iterations. A loop stops rather than wrapping its
internal cursor at the integer boundary. Assigning to the loop variable inside
the body does not change the range's next value. After the loop, the variable
retains its last assigned value, including any body assignment; an empty loop
does not assign it at all. Initialize it before the loop if you need to read
it afterward and the range might be empty.

Iteration over strings or collections other than integer arrays, standalone range objects, and a
variable step are not implemented yet.

## break, continue, pass

```python
total = 0
for i in range(10):
    if i == 2:
        continue
    if i == 5:
        break
    total += i
```

`break` exits the innermost loop. `continue` begins its next iteration; a `for`
loop still advances its range cursor. `pass` does nothing and can stand in for
an empty block. Nested loops are supported. Loop `else` blocks, single-line
suites, exceptions, and comprehensions are not supported yet.
