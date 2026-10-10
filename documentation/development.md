# Pyson development on Windows

The automated setup supports **64-bit Windows**. Install 64-bit Node.js 18 or
newer with npm, and Git if you will clone the repository. Python is optional
unless you want to run emulator tests. The setup does not install system-wide
software, require administrator rights, or change PATH.

## Fresh clone

Open PowerShell in the cloned project directory:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run doctor
npm.cmd run test:compiler
npm.cmd run build -- examples/star-chase/main.pysn star-chase
```

Open `binary/star-chase.gb` in your preferred Game Boy emulator. `npm.cmd` avoids
PowerShell's script execution policy restrictions on `npm.ps1`. The setup invokes
Windows PowerShell directly to extract the archive; you do not need to change
your execution policy or activate a virtual environment.

`npm ci` installs the locked JavaScript dependencies, including Jison 0.4.18.
`setup` downloads the official RGBDS 1.0.4 Windows x64 release, verifies its
SHA-256 checksum, validates its executables, and installs them in `tools/rgbds/`.
Re-running setup reuses a complete local installation of the pinned version.
It replaces missing or incompatible tools with the pinned version.

The release URL, checksum, and tool names are recorded in
[`scripts/toolchain.json`](../scripts/toolchain.json). See the
[official RGBDS release](https://github.com/gbdev/rgbds/releases/tag/v1.0.4).
Setup needs HTTPS access to GitHub; dependency installation needs npm registry access.

## Emulator tests

Install **64-bit Python 3.10–3.13** with its Windows `py` launcher. Python 3.10 is
the version currently verified here; the installer accepts the supported range
for the pinned packages. Python 3.14 and newer require a dependency update first.

```powershell
npm.cmd run setup:emulator
npm.cmd run doctor -- --emulator
npm.cmd run test:emulator
```

This also installs RGBDS if necessary, creates `tools/emulator-env/`, and installs
the versions in `tests/emulator-requirements.txt`. It needs access to PyPI.
The installer prefers the newest supported Python found through the launcher,
then tries `python.exe`. To select a specific installed Python:

```powershell
$env:PYSON_SETUP_PYTHON = 'C:\Path To Python\python.exe'
npm.cmd run setup:emulator
```

To use an existing emulator environment instead of creating a project-local one,
install the same requirements there and point the tests at its Python:

```powershell
$env:PYSON_EMULATOR_PYTHON = 'C:\Path To Environment\Scripts\python.exe'
npm.cmd run doctor -- --emulator
npm.cmd run test:emulator
```

The older `GBPY_SETUP_PYTHON` and `GBPY_EMULATOR_PYTHON` variable names remain
accepted as compatibility aliases. `PYSON_` variables take precedence.

PyBoy may report that optional Pillow screenshot support is unavailable. The
test harness writes its own PNG screenshots and does not require Pillow.

## Commands

| Command | Purpose |
|---|---|
| `npm.cmd run setup` | Install or repair the pinned project-local RGBDS tools |
| `npm.cmd run setup:emulator` | Set up RGBDS and the optional emulator test environment |
| `npm.cmd run doctor` | Check Node, Jison, all RGBDS tool versions, and any existing emulator environment |
| `npm.cmd run doctor -- --emulator` | Also require a working emulator environment |
| `npm.cmd run test:compiler` | Run compiler and ROM-build tests without emulator execution; requires RGBDS |
| `npm.cmd run test:toolchain` | Run the minimal Jison/RGBDS smoke check |
| `npm.cmd run test:emulator` | Require the emulator environment and execute all emulator tests |
| `npm.cmd test` | Run everything, with emulator cases explicitly skipped when their environment is absent |
| `npm.cmd run build -- source.pysn name` | Compile source and write `binary/name.gb` |
| `npm.cmd run build:asm -- source.asm name` | Assemble an existing RGBDS assembly file |

`test:emulator` fails its environment check if the emulator is missing instead
of reporting a successful run containing only skipped tests.

## Troubleshooting

- **Jison missing:** run `npm.cmd ci` before setup or builds.
- **npm audit findings:** the existing Jison 0.4.18 dependency chain currently
  reports four high-severity findings through its legacy CLI dependencies.
  Installation and the tested build workflow succeed; updating that dependency
  chain is separate from installing the pinned development environment.
- **RGBDS missing or wrong version:** run `npm.cmd run setup`. Builds prefer local
  tools, then fall back to PATH. `doctor` identifies incompatible versions.
- **Download blocked:** manually download the official `rgbds-win64.zip`, then run
  `npm.cmd run setup -- --rgbds-archive "C:\Downloads\rgbds-win64.zip"`.
  The supplied archive receives the same checksum validation. You still need
  JavaScript dependencies installed.
- **No suitable Python:** install a supported 64-bit version with the launcher,
  or set `PYSON_SETUP_PYTHON` to the executable.
- **Old virtual environment:** rename `tools/emulator-env/`, then run
  `setup:emulator` to create a new one. Virtual environments are not portable
  between machines or Python installations.

## Repository contents

ROM builds also generate `build/<name>.memory.json` and print WRAM usage.
The report includes variable addresses and sizes, plus field offsets and strides
for [records](records.md). Its total includes runtime buffers and compiler
temporaries; named-variable bytes are reported separately.

Commit `src/`, `jison/`, `include/`, `scripts/`, `tests/`, `documentation/`,
`examples/` (including BMP assets), package manifests, and repository configuration.
`package-lock.json` is required for reproducible JavaScript installation.

Do not commit `node_modules/`, downloaded tools, Python environments, `build/`,
ROMs, screenshots, logs, or personal saves. `.gitignore` excludes generated
directories and emulator saves; `.gitattributes` gives text files consistent
line endings and treats bitmap assets as binary. No empty generated directories
need to be committed: setup, builds, and tests create them.
