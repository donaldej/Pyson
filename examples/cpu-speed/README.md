# CPU speed comparison

```powershell
npm.cmd run build -- examples/cpu-speed/main.pysn cpu-speed
npm.cmd run profile -- examples/cpu-speed/main.pysn --target cgb
```

The character crosses the screen while each update performs deliberate CPU
work. Change `header.cpu_speed` from `"double"` to `"normal"` and rebuild to
compare the available Color CPU budget. The same ROM runs at normal speed on
monochrome hardware. Display refresh rate and audio pitch remain unchanged.

Movement here advances once per game update, so faster updates make it move
faster. This is a performance illustration, not an elapsed-time movement system.
Existing games remain normal-speed unless they explicitly select double speed.
