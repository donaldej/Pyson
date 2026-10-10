# Contributing to Pyson

Follow the [Windows setup guide](documentation/development.md). Keep the npm
lockfile and pinned tool/dependency versions in sync when intentionally updating
the development environment.

Compiler implementation lives in `src/`, the grammar in `jison/`, and Game Boy
runtime assembly in `include/`. Feature references belong in `documentation/`;
include a `.pysn` example when introducing a user-visible feature.

Run `npm.cmd run test:compiler` for compiler and build changes. For changes to
generated assembly or runtime behavior, also run `npm.cmd run test:emulator`
after installing its environment. `npm.cmd test` runs both when available.

Keep generated assembly, ROMs, test fixtures, local tool installations, and save
files out of commits. Preserve source BMP assets and test source files.

When changing instructions emitted inside functions, update the supported sizing
logic in `src/code-banking.js` if necessary. RGBDS assertions verify the exact
size of each banked function during builds.
