# Star Chase

Build from the repository root:

```powershell
npm.cmd run build -- examples/star-chase/main.pysn star-chase
```

Open `binary/star-chase.gb`. A or Start begins; D-pad moves. Collect ten stars
and avoid the red enemy. On either result screen, Up/Down highlights Replay
or Title Screen and A confirms.

`main.pysn` dispatches the functions in `screens/`. Shared state and reusable
functions live in `includes/`; sprites and the board live in `assets/`.
The original text version is preserved in `classic.pysn`.
See [the game reference](../../documentation/star-chase.md) and
[module documentation](../../documentation/modules.md).
