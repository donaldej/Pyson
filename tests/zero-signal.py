"""Exercise a complete, unmodified Zero Signal show on DMG and CGB hardware."""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import zlib
import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/zero-signal.report.json').read_text())
worlds = json.loads((root / 'build/zero-signal-worlds.json').read_text())
variables = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
symbols = {}
for line in (root / 'build/zero-signal.sym').read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
output = root / 'build/zero-signal-preview'
output.mkdir(exist_ok=True)

def png(pixels, filename):
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(height))
    filename.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

rom = root / 'binary/zero-signal.gb'
raw = rom.read_bytes()
assert raw[0x143] == 0x80 and raw[0x147] == 0x19
for cgb in [True, False]:
    emulator = PyBoy(str(rom), window='null', symbols=str(root / 'build/zero-signal.sym'), cgb=cgb, sound_emulated=True)
    emulator.set_emulation_speed(0)
    def word(name):
        at = variables[name]
        return emulator.memory[at] | emulator.memory[at + 1] << 8
    seen, audible = set(), set()
    pictures = {}
    motion = [set() for _ in range(4)]
    maximum = [0] * 4
    camera = [[] for _ in range(4)]
    violations = []
    def check_write(_):
        if emulator.memory[0xff41] & 3 == 3:
            violations.append('mode 3 streamed write')
    emulator.hook_register(None, 'StreamWriteAccessible.write', check_write, None)
    try:
        for frame in range(16000):
            emulator.tick(1, True)
            scene, tick = word('scene'), word('tick')
            if word('cycles'):
                break
            if scene < 4 and 70 < tick < 850:
                seen.add(scene)
                if cgb:
                    assert emulator.memory[0xff4d] & 0x80, 'CGB double speed was lost'
                assert emulator.memory[0xff40] & 128, 'LCD blanked during scene animation'
                oam = bytes(emulator.memory[0xfe00:0xfea0])
                motion[scene].add(oam)
                scan = [0] * 144
                for slot in range(40):
                    y = oam[slot * 4] - 16
                    for line in range(max(0, y), min(144, y + 8)):
                        scan[line] += 1
                maximum[scene] = max(maximum[scene], max(scan))
                if emulator.sound.ndarray.any():
                    audible.add(scene)
                if scene == 1:
                    at = symbols['wCameraX']
                    current = emulator.memory[at] | emulator.memory[at+1] << 8
                    if camera[scene]:
                        assert current >= camera[scene][-1], 'A landscape pan reversed'
                    camera[scene].append(current)
                if frame & 7 == 0:
                    at = symbols['wCameraX']
                    queued = emulator.memory[at] | emulator.memory[at+1] << 8
                    difference = ((queued & 255) - emulator.memory[0xff43] + 128) % 256 - 128
                    displayed = queued - difference
                    world = worlds[scene]
                    visible = set()
                    for row in range(2, 20):
                        for column in range(displayed // 8, (displayed + 159) // 8 + 1):
                            tile = world['ids'][row * world['width'] + column]
                            expected = world['slots'][tile]
                            actual = emulator.memory[0, 0x9800 + (row % 32) * 32 + column % 32]
                            assert actual == expected, f'Scene {scene}: streamed cell corrupted'
                            visible.add(tile)
                    for tile in visible:
                        at = 0x8000 + world['slots'][tile] * 16
                        assert list(emulator.memory[0, at:at+16]) == world['tiles'][tile], f'Scene {scene}: visible tile overwritten'
                if scene not in pictures and tick >= 450:
                    pictures[scene] = emulator.screen.ndarray[:, :, :3].copy()
                    png(pictures[scene], output / f'{"cgb" if cgb else "dmg"}-{scene}.png')
        else:
            raise AssertionError(f'Show did not complete: scene {scene}, tick {tick}')
        assert seen == audible == set(range(4)), (seen, audible)
        assert len(pictures) == 4
        assert len({hashlib.sha256(p.tobytes()).digest() for p in pictures.values()}) == 4
        assert all(n <= 10 for n in maximum), maximum
        assert all(len(states) > 15 for states in motion), list(map(len, motion))
        assert all(max(camera[s]) > 200 for s in [1]), list(map(lambda a: max(a, default=0), camera))
        assert not violations, violations[:5]
        sheet = np.concatenate([np.concatenate([pictures[i] for i in range(row*2, row*2+2)], axis=1) for row in range(2)], axis=0)
        png(np.repeat(np.repeat(sheet, 3, axis=0), 3, axis=1), output / f'{"cgb" if cgb else "dmg"}-scenes.png')
        # Exercise the advertised controls after the uninterrupted full show.
        emulator.tick(120, True)
        emulator.button_press('start')
        emulator.tick(12, True)
        emulator.button_release('start')
        emulator.tick(12, True)
        assert word('paused') == 1, 'Start did not pause'
        frozen = word('tick')
        emulator.tick(60, True)
        assert word('tick') == frozen, 'Paused scene kept advancing'
        emulator.button_press('start')
        emulator.tick(12, True)
        emulator.button_release('start')
        emulator.tick(20, True)
        assert word('paused') == 0 and word('tick') > frozen, 'Start did not resume'
        emulator.button_press('a')
        emulator.tick(12, True)
        emulator.button_release('a')
        emulator.tick(100, True)
        assert word('scene') == 1, 'A did not skip to the city'
        print(json.dumps({'hardware': 'CGB' if cgb else 'DMG', 'frames': frame, 'max_sprites_per_scanline': maximum, 'motion_states': list(map(len, motion)), 'camera_travel': [max(v, default=0) for v in camera]}), flush=True)
    finally:
        emulator.stop(save=False)
