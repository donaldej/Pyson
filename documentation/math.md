# Math and constants

| Helper | Behavior |
| --- | --- |
| `abs(value)` | Signed magnitude; `abs(-32768)` wraps to -32768 |
| `min(a, b)` | Smaller of two numbers |
| `max(a, b)` | Larger of two numbers |
| `clamp(value, low, high)` | Limit to inclusive bounds; reversed bounds return 0 |

These helpers also accept [fixed-point numbers](fixed-point.md); their smaller
range and precision apply. For example, `abs(-2048.0)` wraps to `-2048.0`.
They are not Python's iterable/variadic forms of `min` and
`max`. They compile as banked functions only when used. Arithmetic retains the
language's signed 16-bit rules.

```python
TILE_SIZE = constant(8)
PLAYER_WIDTH = constant(TILE_SIZE * 2)
speed = clamp(requested_speed, -3, 3)
```

`constant(value)` requires a unique module-level assignment. Its value is
substituted into uses during compilation, with no WRAM allocation or runtime
initialization. It supports integer/boolean literals, unary minus, arithmetic
and bitwise expressions, and previously declared constants. Division by zero
and final values outside -32768..32767 fail compilation. These expressions are
evaluated mathematically at compile time; ordinary runtime arithmetic wraps.

Constants can be shared through imports. They cannot be reassigned or shadowed
by function parameters or local assignments. They are a Pyson extension rather
than Python's informal uppercase-variable convention.

See [functions](functions.md) for default and named arguments.
