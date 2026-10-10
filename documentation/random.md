# Random numbers

| Call | Behavior |
| --- | --- |
| `random_seed(seed)` | Reset the shared generator using a signed 16-bit integer, including zero |
| `randrange(stop)` | Integer from 0 through `stop - 1` |
| `randrange(start, stop)` | Integer from `start` through `stop - 1` |
| `randint(low, high)` | Integer from `low` through `high`, including both endpoints |

```python
random_seed(123)
enemy_x = randrange(8, 145)
damage = randint(1, 6)
rare_drop = randrange(100) < 5
```

Integer arguments can be positional or [named](arguments.md): `seed`,
`low`/`high`, and `start`/`stop` respectively. Expressions evaluate once in
written order. `randrange(stop=6)` defaults `start` to zero.
Ranges can cross zero and can cover the complete signed 16-bit domain.
`randint(5, 5)` returns 5. Empty literal ranges fail compilation. Empty ranges
computed at runtime return 0 and leave the generator state unchanged.
Step arguments, floating-point numbers, random choice from a list, and Python's
`random` module are not implemented by these built-ins.

The initial seed is always 1. Reusing a seed reproduces the same sequence when
calls and bounds occur in the same order. All modules and functions share one
generator. Drawing frames, music, and other runtime helpers do not consume it.
Even a singleton valid range consumes a random sample.

For variation between sessions, count frames while waiting for player input and
call `random_seed(frame_counter)` when the player starts. Hardware does not
provide automatic entropy here. To reproduce or resume a sequence, store its
starting seed and reproduce the same calls; saving a seed alone does not capture
the current generator position. The generator differs from Python's algorithm.

The implementation uses a full-period 16-bit linear congruential generator
(`state = state * 25173 + 13849`, modulo 65536), swaps its output bytes, and uses
rejection sampling to avoid modulo bias when mapping to a range. The state
repeats after 65,536 advances; outputs remain correlated, as with simple game
generators. A bounded query can advance more than once when it rejects samples.
The runtime and eight bytes of shared state/scratch are included only when used.

## Playable example

```powershell
npm.cmd run build -- examples/random-gallery/main.pysn random-gallery
```

Open `binary/random-gallery.gb`. A rolls two dice. B resets seed 1 and replays
the first roll; subsequent A presses repeat the original sequence. Select seeds
from the current frame counter and rolls. A one-in-ten bonus uses `randrange()`.
