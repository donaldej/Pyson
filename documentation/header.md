# Header configuration

Header settings describe the ROM and its cartridge hardware. Set them at the
beginning of a `.pysn` file, before executable statements such as variable
assignments, loops, or `print` calls:

```python
header.title = "MY GAME"
header.target = "dmg"
header.version = 1

print("Hello World!", 4, 8)
```

Omitted settings use their defaults. Each setting may be assigned once per
project. Unknown settings, duplicate assignments, invalid values, and header
assignments after executable statements are compile errors. These values are fixed at build
time; they are not variables that can change while the game runs. Header
configuration must be at the top level. Function definitions may appear before
or after header settings because the compiler collects them before execution.

Use quoted strings, decimal integers, and Python-style `True` / `False`.
Setting names and option strings are case-sensitive. Both single and double
quotes work. Put each assignment on its own line; `#` starts a comment outside
a string.

## All configurable settings

| Variable | Available values | Default | Purpose |
| --- | --- | --- | --- |
| `header.title` | 1–16 printable ASCII characters; shorter limits apply to Color targets and manufacturer codes (see below) | `"PYSON"` | Internal ROM title. Does not print a title on screen. |
| `header.target` | `"dmg"`, `"dual"`, `"cgb"` | `"dmg"` | Select original Game Boy compatibility, original + Color support, or Color only. |
| `header.cpu_speed` | `"normal"`, `"double"` | `"normal"` | Double CPU speed on Color hardware; requires `dual` or `cgb`. Dual games keep normal speed on monochrome hardware. Does not change cartridge header bytes. |
| `header.controller` | `"rom_only"`, `"mbc1"`, `"mbc3"`, `"mbc5"` | `"rom_only"` for small games; automatic MBC5 for larger assets or saves (MBC3 with RTC saves) | Select cartridge memory controller; an explicit choice is respected. |
| `header.ram_kb` | `0`, `8`, `32`, `64`, `128`; restricted by controller | `0`; automatic `8` with save calls | External cartridge RAM capacity in KB. This does not change the Game Boy's internal working RAM. |
| `header.battery` | `False`, `True` | `False`; automatic `True` with save calls | Declare battery-backed cartridge storage. Requires external RAM or RTC. |
| `header.rtc` | `False`, `True` | `False` | Declare a real-time clock. Requires MBC3 and battery. |
| `header.rumble` | `False`, `True` | `False` | Declare rumble hardware. Requires MBC5. |
| `header.sgb` | `False`, `True` | `False` | Declare Super Game Boy enhancements. Unavailable with `"cgb"`. |
| `header.version` | Integer `0` through `255` | `0` | Numeric ROM revision. |
| `header.licensee` | Exactly two uppercase ASCII letters or digits | `"00"` | New licensee/publisher code. |
| `header.manufacturer` | `""` or exactly four uppercase ASCII letters or digits | `""` | Optional manufacturer code; requires `"dual"` or `"cgb"`. |
| `header.destination` | `"international"`, `"japan"` | `"international"` | Market metadata. Does not select a language or region-lock the game. |
| `header.rom_kb` | `0`, `32`, `64`, `128`, `256`, `512`, `1024`, `2048`, `4096`, `8192`; restricted by controller | `0` | Requested ROM capacity in KB; `0` selects automatic sizing. |

## Hardware targets and title limits

| Target | Behavior | Maximum title length |
| --- | --- | --- |
| `"dmg"` | Original Game Boy mode, including compatibility mode on Color hardware | 16 characters |
| `"dual"` | Runs on original Game Boy and uses Color mode on Color hardware | 15 characters, or 11 with a manufacturer code |
| `"cgb"` | Color-only ROM | 15 characters, or 11 with a manufacturer code |

The title accepts ASCII spaces, letters, digits, and punctuation. It cannot be
empty or contain newlines. Longer titles are rejected rather than truncated.
The runtime starts with grayscale palettes. Color targets support custom
palettes through the [graphics routines](graphics.md). Original hardware uses
grayscale fallback.

## Controller limits and feature combinations

| Controller | Maximum requested ROM | Available RAM sizes (KB) | Extra hardware |
| --- | --- | --- | --- |
| `"rom_only"` | 32 KB | `0` | No battery, RTC, or rumble |
| `"mbc1"` | 2048 KB | `0`, `8`, `32` | Battery with RAM |
| `"mbc3"` | 2048 KB | `0`, `8`, `32` | Battery with RAM or RTC; RTC requires battery |
| `"mbc5"` | 8192 KB | `0`, `8`, `32`, `64`, `128` | Battery with RAM; optional rumble |

With MBC5 rumble enabled, RAM is limited to 64 KB. A battery without RAM is
accepted only for an MBC3 real-time clock. SGB may be enabled with `"dmg"` or
`"dual"`, regardless of controller.

The compiler derives the cartridge-type byte from the controller, RAM, battery,
RTC, and rumble settings. You do not assign a raw cartridge-type byte.

Static graphics and map data use [automatic ROM banking](banking.md). If the
controller is omitted, larger asset or function sets or an explicit ROM capacity above
32 KB select MBC5. User-defined functions are banked too; main, runtime routines, and sound sequences remain in bank 0.
[Persistent save routines](save.md) supply MBC5, 8 KB RAM, and a battery flag
when omitted (MBC3 if RTC was requested). Explicit settings take precedence.
Clock access, rumble controls, and SGB commands are not implemented yet.
MBC1 ROMs of 1024 KB or more allow at most 8 KB external RAM.

## Generated header fields

The build creates the entry-point jump, Nintendo logo, ROM-size field, header
checksum, and global checksum automatically. The ROM-size field reflects the
actual output capacity. Automatic sizing selects the smallest supported capacity that contains all
placed banks, starting at 32 KB. Requested capacity must fit the asset bank plan.

The old licensee byte is generated as `$33`, selecting `header.licensee` as the
new licensee code. It is not separately configurable. Reserved bytes are also
generated automatically.

## Examples

A minimal project can omit every header assignment:

```python
print("Hello!", 0, 0)
```

A Color-compatible cartridge with declared save RAM:

```python
header.title = "ADVENTURE"
header.target = "dual"
header.controller = "mbc5"
header.ram_kb = 32
header.battery = True
header.rom_kb = 64
header.version = 1
header.licensee = "00"
header.manufacturer = "DEMO"
header.destination = "international"

print("Adventure", 5, 8)
```

For an RTC cartridge, select `"mbc3"`, set `header.battery = True`, and set
`header.rtc = True`. RAM is optional for that combination.

Build a saved source file from the project directory:

```powershell
npm.cmd run build -- examples/header-print.pysn header-print
```

The generated assembly is `build/header-print.asm`; the ROM is
`binary/header-print.gb`. See [print](print.md) for text placement.
