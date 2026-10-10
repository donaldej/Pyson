"""Compare profiling hooks against a run with only its startup marker hooked."""
import hashlib
import io
import json
from pathlib import Path
import sys
from pyboy import PyBoy

config = json.loads(Path(sys.argv[1]).read_text())
profile = json.loads(Path(config['output']).read_text())
emulator = PyBoy(io.BytesIO(Path(config['rom']).read_bytes()), symbols=config['symbols'], window='null',
                 cgb=config['target'] == 'cgb', sound_emulated=True,
                 ram_file=io.BytesIO(bytes([255]) * max(8192, config['ramBytes'])))
emulator.set_emulation_speed(0)
started = False
def start(_):
    global started
    started = True
emulator.hook_register(None, 'MainStart', start, None)
try:
    for _ in range(600):
        emulator.tick(1, False)
        if started:
            break
    assert started
    for _ in range(config['warmup'] + config['frames']):
        emulator.tick(1, False)
    assert emulator._cycles() == profile['final_cpu_cycles'], 'Profiling changed guest CPU timing'
    assert hashlib.sha256(bytes(emulator.memory[0xc000:0xd000])).hexdigest() == profile['final_wram_sha256'], 'Profiling changed game state'
finally:
    emulator.stop(save=False)
print('PASS: profiled and baseline CPU timing and WRAM are identical')
