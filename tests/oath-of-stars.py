"""Run every Oath of Stars movement on both emulated models and capture previews."""
import hashlib
import io
import json
from pathlib import Path
import struct
import zlib
import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/oath-of-stars.report.json').read_text())
worlds = json.loads((root / 'build/oath-of-stars-worlds.json').read_text())
variables = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
symbols = {}
for line in (root / 'build/oath-of-stars.sym').read_text().splitlines():
    if line and not line.startswith(';'):
        at, name = line.split()
        symbols[name] = int(at.split(':')[1], 16)
output = root / 'build/oath-of-stars-preview'
output.mkdir(exist_ok=True)
def png(pixels, filename):
    h, w = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(h))
    filename.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

rom = root / 'binary/oath-of-stars.gb'
raw = rom.read_bytes()
assert raw[0x143] == 0x80 and raw[0x147] == 0x1b and raw[0x149] == 2
for cgb in [True, False]:
    ram = io.BytesIO(bytes([255]) * 8192)
    emulator = PyBoy(str(rom), window='null', symbols=str(root / 'build/oath-of-stars.sym'), cgb=cgb, sound_emulated=True, ram_file=ram)
    emulator.set_emulation_speed(0)
    def word(name):
        at = variables[name]
        return emulator.memory[at] | emulator.memory[at+1] << 8
    seen, audible, pictures = set(), set(), {}
    motion = [set() for _ in range(7)]
    screens = [set() for _ in range(7)]
    camera = [[] for _ in range(7)]
    maximum = [0] * 7
    initial_worlds, coordinated_fades = set(), set()
    violations = []
    def check_write(_):
        if emulator.memory[0xff41] & 3 == 3:
            violations.append('inaccessible streamed write')
    emulator.hook_register(None, 'StreamWriteAccessible.write', check_write, None)
    saved = io.BytesIO()
    try:
        for frame in range(20000):
            emulator.tick(1, True)
            scene, tick = word('scene'), word('tick')
            if scene in [0, 3] and tick < 32 and word('prepared'):
                # Opening and gate must be complete at first presentation,
                # rather than being filled progressively in front of the viewer.
                world = worlds[5]
                start_row = 0 if scene == 0 else 22
                for row in range(start_row, start_row + 18):
                    for col in range(20):
                        tile = world['ids'][row * world['width'] + col]
                        actual = emulator.memory[0, 0x9800 + (row % 32) * 32 + col]
                        assert actual == world['slots'][tile], 'Incomplete first scene image'
                initial_worlds.add(scene)
            if cgb and scene < 7 and 1008 <= tick < 1024 and word('palette_step') == 63:
                at = symbols['wOBJPalettes'] + 8
                assert not any(emulator.memory[at:at+40]), 'Foreground remains bright during black fade'
                coordinated_fades.add(scene)
            if word('cycles'):
                emulator.tick(40, True)
                assert word('completed') == 1
                break
            if scene < 7 and 80 < tick < 945 and word('prepared'):
                seen.add(scene)
                if cgb:
                    assert emulator.memory[0xff4d] & 128
                assert emulator.memory[0xff40] & 128, f'LCD off during act {scene}'
                assert emulator.memory[symbols['wMusicActive']] == 1
                assert emulator.memory[symbols['wWaveMusicActive']] == 1
                oam = bytes(emulator.memory[0xfe00:0xfea0])
                motion[scene].add(oam)
                scan = [0] * 144
                for slot in range(40):
                    y = oam[slot*4] - 16
                    for row in range(max(0, y), min(144, y+8)):
                        scan[row] += 1
                maximum[scene] = max(maximum[scene], max(scan))
                if emulator.sound.ndarray.any():
                    audible.add(scene)
                if frame & 7 == 0:
                    screens[scene].add(hashlib.sha256(emulator.screen.ndarray.tobytes()).digest())
                if scene in [1, 2, 5]:
                    at = symbols['wCameraY' if scene == 5 else 'wCameraX']
                    current = emulator.memory[at] | emulator.memory[at+1] << 8
                    if camera[scene]:
                        assert current >= camera[scene][-1], 'Landscape reversed'
                    camera[scene].append(current)
                if frame & 15 == 0:
                    world = worlds[{0:5,1:0,2:1,3:5,4:2,5:3,6:4}[scene]]
                    at = symbols['wCameraX']
                    queued_x = emulator.memory[at] | emulator.memory[at+1] << 8
                    at = symbols['wCameraY']
                    queued_y = emulator.memory[at] | emulator.memory[at+1] << 8
                    cx = queued_x - (((queued_x & 255) - emulator.memory[0xff43] + 128) % 256 - 128)
                    cy = queued_y - (((queued_y & 255) - emulator.memory[0xff42] + 128) % 256 - 128)
                    visible = set()
                    for row in range(cy // 8, (cy + 143) // 8 + 1):
                        for col in range(cx // 8, (cx + 159) // 8 + 1):
                            tile = world['ids'][row * world['width'] + col]
                            actual = emulator.memory[0, 0x9800 + (row % 32) * 32 + col % 32]
                            assert actual == world['slots'][tile], f'Act {scene}: streamed cell corrupted'
                            visible.add(tile)
                    for tile in visible:
                        at = 0x8000 + world['slots'][tile] * 16
                        assert list(emulator.memory[0, at:at+16]) == world['tiles'][tile], f'Act {scene}: visible graphics overwritten'
                if scene not in pictures and tick >= 490:
                    pictures[scene] = emulator.screen.ndarray[:, :, :3].copy()
                    png(pictures[scene], output / f'{"cgb" if cgb else "dmg"}-{scene}.png')
        else:
            raise AssertionError(f'Show stalled at act {scene}, tick {tick}')
        assert seen == audible == set(range(7)), (seen, audible)
        assert len(pictures) == 7
        assert len({hashlib.sha256(p.tobytes()).digest() for p in pictures.values()}) == 7
        assert all(n <= 10 for n in maximum), maximum
        assert all(len(m) > 20 for m in motion), list(map(len, motion))
        assert all(len(m) > 30 for m in screens), list(map(len, screens))
        assert all(max(camera[s]) >= 500 for s in [1, 2, 5]), list(map(lambda a: max(a, default=0), camera))
        assert not violations, violations[:5]
        assert initial_worlds == {0, 3}, initial_worlds
        if cgb:
            assert coordinated_fades == set(range(7)), coordinated_fades
        blank = np.zeros_like(pictures[0])
        sheet = np.concatenate([np.concatenate([pictures.get(row*4+i, blank) for i in range(4)], axis=1) for row in range(2)], axis=0)
        png(np.repeat(np.repeat(sheet, 3, axis=0), 3, axis=1), output / f'{"cgb" if cgb else "dmg"}-scenes.png')
        print(json.dumps({'hardware':'CGB' if cgb else 'DMG', 'frames':frame, 'sprite_max':maximum, 'motion_states':list(map(len,motion)), 'screen_states':list(map(len,screens)), 'camera_travel':[max(v,default=0) for v in camera]}), flush=True)
    finally:
        emulator.stop(save=True, ram_file=saved, rtc_file=io.BytesIO())
    reload = PyBoy(str(rom), window='null', cgb=cgb, ram_file=io.BytesIO(saved.getvalue()))
    reload.set_emulation_speed(0)
    try:
        reload.tick(200, True)
        at = variables['completed']
        assert reload.memory[at] | reload.memory[at+1] << 8 == 1, 'Show count was not saved'
    finally:
        reload.stop(save=False)
    controls = PyBoy(str(rom), window='null', cgb=cgb, ram_file=io.BytesIO(bytes([255])*8192))
    controls.set_emulation_speed(0)
    def control_word(name):
        at = variables[name]
        return controls.memory[at] | controls.memory[at+1] << 8
    try:
        for _ in range(300):
            controls.tick(1, True)
            if control_word('prepared') and control_word('tick') >= 80:
                break
        controls.button_press('start')
        controls.tick(40, True)
        controls.button_release('start')
        controls.tick(20, True)
        assert control_word('paused') == 1
        stopped = control_word('tick')
        controls.tick(50, True)
        assert control_word('tick') == stopped, 'Pause did not freeze scene time'
        assert controls.memory[symbols['wMusicPaused']] == 1
        controls.button_press('start')
        controls.tick(40, True)
        controls.button_release('start')
        controls.tick(30, True)
        assert control_word('paused') == 0 and control_word('tick') > stopped
        controls.button_press('a')
        controls.tick(50, True)
        controls.button_release('a')
        controls.tick(30, True)
        assert control_word('scene') == 1 and control_word('prepared') == 1
        print(json.dumps({'hardware':'CGB' if cgb else 'DMG','controls':'pause/resume/skip passed','save_reload':'passed'}), flush=True)
    finally:
        controls.stop(save=False)
