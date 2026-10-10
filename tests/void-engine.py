"""Run a full MBC5 show on both hardware models and check cartridge persistence."""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import zlib
from pyboy import PyBoy

config = json.loads(Path(sys.argv[1]).read_text())
symbols = {}
for line in Path(config['symbols']).read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
variables = {v['name']: v['address'] for v in config['variables'] if v['scope'] == '$module'}

def word(emulator, name):
    address = variables[name]
    return emulator.memory[address] | emulator.memory[address + 1] << 8

def png(emulator, file):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = emulator.screen.ndarray
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(144))
    Path(file).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 144, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

for cgb in [False, True]:
    emulator = PyBoy(config['rom'], window='null', symbols=config['symbols'], cgb=cgb, sound_emulated=True, ram_file=io.BytesIO(bytes([255]) * 8192))
    emulator.set_emulation_speed(0)
    seen, audible, captures = set(), set(), set()
    motion = {i: set() for i in range(6)}
    maximum = {i: 0 for i in range(6)}
    last_camera = {i: -1 for i in range(4)}
    farthest = {i: 0 for i in range(4)}
    start, end = {}, {}
    sample_frames = {}
    violations = []
    def check_write(_):
        if emulator.memory[0xff41] & 3 == 3:
            violations.append('mode 3 write')
    emulator.hook_register(None, 'StreamWriteAccessible.write', check_write, None)
    saved = io.BytesIO()
    try:
        for hardware_frame in range(11000):
            emulator.tick(1, True)
            scene, tick = word(emulator, 'scene'), word(emulator, 'tick')
            if tick > 8:
                seen.add(scene)
                start.setdefault(scene, hardware_frame)
                end[scene] = hardware_frame
                motion[scene].add(bytes(emulator.memory[0xfe00:0xfea0]))
                samples = emulator.sound.ndarray
                if len(samples) and int(samples.max()) != int(samples.min()):
                    audible.add(scene)
                scan = [0] * 144
                for slot in range(40):
                    y = emulator.memory[0xfe00 + slot * 4] - 16
                    for line in range(max(0, y), min(144, y + 8)):
                        scan[line] += 1
                maximum[scene] = max(maximum[scene], max(scan))
            if 16 < tick < 490 and scene < 4:
                axis, register = ('Y', 0xff42) if scene == 1 else ('X', 0xff43)
                address = symbols['wCamera' + axis]
                current = emulator.memory[address] | emulator.memory[address + 1] << 8
                assert current >= last_camera[scene], f'Scene {scene} camera reversed'
                last_camera[scene] = current
                farthest[scene] = max(farthest[scene], current)
                assert emulator.memory[0xff40] & 128, 'LCD blanked during scrolling'
                delta = ((current & 255) - emulator.memory[register] + 128) % 256 - 128
                displayed = current - delta
                cx, cy = (0, displayed) if scene == 1 else (displayed, 0)
                world = config['worlds'][scene]
                visible = set()
                for row in range(cy // 8, (cy + 143) // 8 + 1):
                    for column in range(cx // 8, (cx + 159) // 8 + 1):
                        tile_id = world['ids'][row * world['width'] + column]
                        slot = world['slots'][tile_id]
                        assert emulator.memory[0, 0x9800 + (row % 32) * 32 + column % 32] == slot, f'Scene {scene} streamed cell corrupted'
                        visible.add(tile_id)
                for tile_id in visible:
                    address = 0x8000 + world['slots'][tile_id] * 16
                    assert list(emulator.memory[0, address:address + 16]) == world['tiles'][tile_id], 'Visible tile overwritten'
            if 32 < tick < 480:
                assert emulator.memory[symbols['wMusicActive']] == 1
                assert emulator.memory[symbols['wWaveMusicActive']] == 1
                assert abs(emulator.memory[symbols['wMusicSteps']] - emulator.memory[symbols['wWaveMusicSteps']]) <= 1
            if scene not in captures and 100 <= tick <= 110:
                png(emulator, Path(config['output']) / f'{"cgb" if cgb else "dmg"}-{scene}.png')
                captures.add(scene)
                sample_frames[scene] = hashlib.sha256(emulator.screen.ndarray.tobytes()).hexdigest()
            if word(emulator, 'cycles') >= 1:
                emulator.tick(20, True)
                assert word(emulator, 'completed') == 1
                break
        else:
            raise AssertionError(f'Demo failed to finish: scene {scene}, tick {tick}')
        assert seen == set(range(6)), seen
        assert audible == seen and captures == seen
        assert len(set(sample_frames.values())) == 6, 'Scenes render identically'
        assert all(value <= 10 for value in maximum.values()), maximum
        assert all(len(v) > 20 for v in motion.values()), {k: len(v) for k, v in motion.items()}
        assert all(farthest[i] >= 700 for i in [1, 2, 3]), farthest
        assert not violations, violations[:5]
        print(json.dumps({'hardware': 'CGB' if cgb else 'DMG', 'seconds': round(hardware_frame / 59.7275, 1), 'scene_frames': {i: end[i] - start[i] for i in range(6)}, 'max_sprites_per_scanline': maximum, 'camera_travel': farthest}))
    finally:
        emulator.stop(save=True, ram_file=saved, rtc_file=io.BytesIO())
    reload = PyBoy(config['rom'], window='null', cgb=cgb, ram_file=io.BytesIO(saved.getvalue()))
    reload.set_emulation_speed(0)
    try:
        reload.tick(150, True)
        assert word(reload, 'completed') == 1, 'Completed show count did not survive restart'
    finally:
        reload.stop(save=False)
