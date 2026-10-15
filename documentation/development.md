# Pyson development on Windows

The automated setup supports **64-bit Windows**. Install 64-bit Node.js 18 or
newer with npm, and Git if you will clone the repository. Python is optional
unless you want to run emulator tests. The setup does not install system-wide
software, require administrator rights, or change PATH.

You do not need Docker, Python, an emulator, FFmpeg, an editor extension, or a
C/C++ compiler to build ROMs. The setup script downloads ready-to-run RGBDS
executables. Git is only needed if you choose to clone or contribute with Git;
downloading the repository ZIP also works.

| Tool | Required? | Purpose |
|---|---|---|
| Node.js and npm | Yes | Run the compiler and install its JavaScript dependencies |
| Jison | Yes, installed by `npm.cmd ci` | Parse Pyson source |
| RGBDS assembler, linker, and header fixer | Yes, installed by `setup` | Turn generated assembly into a ROM |
| `rgbgfx` | No; bundled with RGBDS | Separate graphics utility; Pyson already converts BMPs |
| Game Boy emulator such as BGB | Only to play or interactively debug ROMs | Choose your preferred emulator |
| Python and PyBoy | Only for automated emulator tests and profiling | Installed separately through the optional setup path |
| FFmpeg | Only for MP4 recording | Used by the optional recording scripts |

## Fresh clone

Open PowerShell in the cloned project directory:

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run build -- examples/hello-world/main.pysn hello-world
```

Your first ROM is `binary/hello-world.gb`. Open it in your preferred Game Boy
emulator if you want to play it. `npm.cmd` avoids
PowerShell's script execution policy restrictions on `npm.ps1`. The setup invokes
Windows PowerShell directly to extract the archive; you do not need to change
your execution policy or activate a virtual environment.

`npm ci` installs the locked JavaScript dependencies, including Jison 0.4.18.
`setup` downloads the official RGBDS 1.0.4 Windows x64 release, verifies its
SHA-256 checksum, validates its executables, and installs them in `tools/rgbds/`.
Re-running setup reuses a complete local installation of the pinned version.
It replaces missing or incompatible tools with the pinned version.
An installation with the three required executables is enough; a missing
optional `rgbgfx` does not trigger a repair download.

No tests are needed just to build a game. To check your build environment or run
the compiler's own tests later:

```powershell
npm.cmd run doctor
npm.cmd run test:compiler
```

Normal `doctor` and `setup` do not inspect Python. A missing, old, or broken
optional emulator environment therefore cannot prevent a successful build-tool
check. To check it explicitly, use `npm.cmd run doctor -- --emulator`.

The release URL, checksum, and tool names are recorded in
[`scripts/toolchain.json`](../scripts/toolchain.json). See the
[official RGBDS release](https://github.com/gbdev/rgbds/releases/tag/v1.0.4).
Setup needs HTTPS access to GitHub; dependency installation needs npm registry access.

## Understanding installer checks

Before downloading anything, setup checks the Node.js version/architecture,
the locked Jison version, and each required RGBDS executable. It prints the
installed version and location, along with what it will do:

| Message | Meaning | What happens next |
|---|---|---|
| `[OK]` | The installation matches the project's requirements | Reuse it |
| `[MISSING]` | A required project-local executable is absent | Install the pinned RGBDS package |
| `[INCOMPATIBLE]` | An installed version or architecture does not match the project | Explain the required version; repair local RGBDS, or stop with instructions for Node/Jison |
| `[UNUSABLE]` | A local executable exists but cannot run or report its version | Repair the project-local RGBDS tools |
| `[INFO] PATH ...` | A system RGBDS tool was found, mismatched, or absent | Use the pinned project-local tools; leave system tools and PATH unchanged |
| `[OPTIONAL]` | The tool is not needed for normal compilation | Do not block a normal setup |

For example, a local `rgbasm` at version `0.9.4` is reported with the required
project version `1.0.4` before setup repairs it. "Incompatible" here means it
does not match Pyson's pinned, tested version; it does not mean that release is
broken in general. A different RGBDS installed elsewhere is left alone.

When RGBDS must be installed or repaired, setup also checks Windows PowerShell
can extract ZIP archives before proceeding. Node/Jison failures are reported
before downloads. The installer cannot run without Node.js; install Node first.

Only `setup:emulator` checks Python and its packages. It reports each rejected
Python candidate's version and bitness, then looks for a supported installation.
An explicit `PYSON_SETUP_PYTHON` choice is not silently replaced by another Python.
A compatible existing project-local emulator environment is reused without
running pip. Missing or wrong package versions are listed and repaired locally;
an unsupported or unusable Python environment gets instructions to rename it
and recreate it. Other Python installations are never replaced.

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
The installer first checks the default Python launcher, then tries supported
launcher versions from newest to oldest and finally `python.exe`. To select a
specific installed Python:

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
| `npm.cmd run doctor` | Check required Node, Jison, and RGBDS build tools; optional tools do not cause failures |
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
- **A Jison range such as `^0.4.18`:** checks compare the installed version to
  the exact version in `package-lock.json`, not to the range text. If the
  manifests disagree, restore matching files or run `npm.cmd install` to update
  the lockfile. Run `npm.cmd ci` afterward for a reproducible installation.
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
Every build also writes a readable `build/<name>.report.txt`, including unique
tile counts, streaming VRAM slots, palettes, and sprite components per frame.
See [build reports](build-reports.md) for a plain-language explanation.
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
