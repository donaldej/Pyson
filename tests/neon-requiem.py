"""Play a complete natural demo cycle; capture scenes and verify audio/motion."""
import json
import struct
import sys
import zlib
from pathlib import Path
from pyboy import PyBoy

config = json.loads(Path(sys.argv[1]).read_text())
symbols = {}
for line in Path(config['symbols']).read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
addresses = {v['name']: v['address'] for v in config['variables'] if v['scope'] == '$module'}
def word(emulator, name):
    address = addresses[name]
    return emulator.memory[address] | emulator.memory[address + 1] << 8

def screenshot(emulator, file):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = emulator.screen.ndarray
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(144))
    Path(file).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 144, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

emulator = PyBoy(config['rom'], window='null', symbols=config['symbols'], cgb=True, sound_emulated=True)
emulator.set_emulation_speed(0)
seen = set()
captures = set()
scene_start = {}
scene_end = {}
motion = {i: set() for i in range(4)}
audible = set()
effect_channels = set()
city_camera = -1
city_max_camera = 0
city_max_lag = 0
maximum_sprites = {i: 0 for i in range(4)}
try:
    for hardware_frame in range(5500):
        emulator.tick(1, True)
        scene, tick = word(emulator, 'scene'), word(emulator, 'tick')
        if scene == 1 and 16 < tick < 500:
            address = symbols['wCameraX']
            current = emulator.memory[address] | emulator.memory[address + 1] << 8
            assert current >= city_camera, f'City reversed: {current} < {city_camera}'
            city_camera = current
            city_max_camera = max(city_max_camera, current)
            city_max_lag = max(city_max_lag, abs(current - word(emulator, 'includes.visuals.city_camera')))
            assert emulator.memory[0xff40] & 128, 'City streaming blanked the LCD'
            # Reconcile buffered coordinates with the actual hardware scroll.
            delta = ((current & 255) - emulator.memory[0xff43] + 128) % 256 - 128
            displayed_x = current - delta
            world = config['world']
            visible = set()
            for row in range(18):
                for column in range(displayed_x // 8, (displayed_x + 159) // 8 + 1):
                    tile_id = world['ids'][row * world['width'] + column]
                    slot = world['slots'][tile_id]
                    assert emulator.memory[0, 0x9800 + row * 32 + column % 32] == slot, f'City cell corrupted at {column},{row}'
                    visible.add(tile_id)
            for tile_id in visible:
                address = 0x8000 + world['slots'][tile_id] * 16
                assert list(emulator.memory[0, address:address + 16]) == world['tiles'][tile_id], 'Visible city tile overwritten'
        if tick > 8:
            seen.add(scene)
            scene_start.setdefault(scene, hardware_frame)
            scene_end[scene] = hardware_frame
            motion[scene].add(bytes(emulator.memory[0xfe00:0xfea0]))
            scanlines = [0] * 144
            for slot in range(40):
                y = emulator.memory[0xfe00 + slot * 4] - 16
                for line in range(max(0, y), min(144, y + 8)):
                    scanlines[line] += 1
            maximum_sprites[scene] = max(maximum_sprites[scene], max(scanlines))
            samples = emulator.sound.ndarray
            if len(samples) and int(samples.max()) != int(samples.min()):
                audible.add(scene)
            if emulator.memory[0xff26] & 2:
                effect_channels.add(2)
            if emulator.memory[0xff26] & 8:
                effect_channels.add(4)
            if 16 < tick < 480:
                assert emulator.memory[symbols['wMusicActive']] == 1
                assert emulator.memory[symbols['wWaveMusicActive']] == 1
                assert abs(emulator.memory[symbols['wMusicSteps']] - emulator.memory[symbols['wWaveMusicSteps']]) <= 1, 'Music voices drifted'
        if scene not in captures and 100 <= tick <= 110:
            screenshot(emulator, Path(config['output']) / f'scene-{scene}.png')
            captures.add(scene)
        if word(emulator, 'cycles') >= 1:
            break
    else:
        raise AssertionError(f'Demo exceeded 5,500 frames: scene={scene}, tick={tick}, scene lengths={ {i: scene_end.get(i, 0) - scene_start.get(i, 0) for i in range(4)} }')
    assert seen == {0, 1, 2, 3}, seen
    assert captures == seen, captures
    assert audible == seen, audible
    assert effect_channels == {2, 4}, effect_channels
    assert city_max_camera >= 700, city_max_camera
    assert city_max_lag <= 8, city_max_lag
    assert all(value <= 10 for value in maximum_sprites.values()), maximum_sprites
    assert all(len(values) > 30 for values in motion.values()), {k: len(v) for k, v in motion.items()}
    assert emulator.memory[0xff40] & 128, 'LCD disabled at completion'
    print(json.dumps({'hardware_frames': hardware_frame, 'seconds': round(hardware_frame / 59.7275, 1), 'scene_frames': {i: scene_end[i] - scene_start[i] for i in range(4)}, 'moving_frames': {i: len(v) for i, v in motion.items()}, 'audible_scenes': sorted(audible), 'city_max_camera': city_max_camera, 'city_max_lag': city_max_lag, 'maximum_sprites_per_scanline': maximum_sprites}))
finally:
    emulator.stop(save=False)
