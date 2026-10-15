# Build reports and runtime source locations

## Understanding compiler errors

If Pyson cannot build your program, it names the file and, when available,
the line where it found the problem. It also shows that line of your code. For common mistakes, a
`Hint:` explains what to try. Errors inside an imported file show that file's
code, so open the named file rather than searching only your main program.

For example, `print(position, 0, 0)` fails if `position` contains a fractional
number. Use `print(int(position), 0, 0)` to print its whole-number part.
`int()` drops the fraction; it does not round to the nearest whole number.

If an error says a variable may be used before assignment, give it a starting
value before reading it. An assignment inside an `if` may never run, so make
sure the other path also provides a value.

A wrong named argument lists the accepted names. For `print`, use `value`,
`x`, `y`, and optionally `palette`: `print(value="Hello", x=0, y=0)`.
Read-only tables cannot be edited while the game runs; use a normal list for
values you need to change, then update an item with `values[0] = 4`.

Hints cover common cases, not every possible error. They suggest a fix;
you still choose the behavior your game needs. Fix the first reported error
and build again to discover any remaining problems.

## Reports from successful builds

Every successful CLI build writes `build/<name>.report.json` alongside the
existing memory, asset, bank, sound, and music reports.

A readable `build/<name>.report.txt` is generated at the same time, with memory,
tile deduplication, streaming slots, palettes, and per-frame sprite costs.
See [reading build reports](build-reports.md). The JSON adds a `graphics` summary;
existing fields and linked source/variable metadata remain available.

The JSON report includes:

- ROM size and bank placements.
- WRAM used/free, named variables, mutable-map bytes, and runtime/buffer bytes.
- Variable addresses, sizes, scopes, and field layouts.
- Read-only tables marked with ROM storage, bank addresses, zero WRAM bytes,
  and their cartridge size in `romBytes`.
- Compile-time constants and asset summaries.
- Source statement labels with filename, line, scope, ROM bank, and address.

The source map can be matched against RGBDS symbols and an emulator's execution
address. Multiple labels may share an address for declarations or statements
that emit no instructions. It is an instruction-level aid, not a source debugger
with breakpoints or expression-level stepping. Reports are generated after
linking, so they reflect actual addresses and cartridge size.

Runtime array-bound and division-by-zero failures display the source basename
and line above the existing error message. Pool field reads also record a
source context. Long filenames clip at the screen edge; full paths remain in the
JSON source map. Invalid handle queries that intentionally return a sentinel
remain ordinary game operations and do not raise an error.

Source context uses two shared WRAM bytes only when instrumented operations
appear, plus ROM strings and call-site instructions. Source labels themselves
add no ROM instruction bytes. Internal helpers can appear as `<Pyson ...>`
sources in the report. This does not add stack traces or an interactive debugger.

Build `examples/runtime-diagnostics/main.pysn` as `runtime-diagnostics`. A
triggers an array-bound failure; B triggers division by zero. Reset the ROM to
test the other error. These are deliberate failures in this diagnostics example.
