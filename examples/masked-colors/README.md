# Masked colors

Build with `node src/cli.js examples/masked-colors/main.pysn masked-colors`.
Run the resulting `binary/masked-colors.gb` in either hardware mode.

On Game Boy Color, the two shapes have separate red and blue color accents.
On the original Game Boy, they keep their four shades. Press A to toggle the
accents. Watch the overlap: the front shape's outline hides the rear color,
and transparent holes continue to show the scenery.

See [masked graphics](../../documentation/masked-graphics.md) for the simple
API and the color coverage limits for larger pictures. The included BMP is a
compilation input; no generator or optional development tool is required.
