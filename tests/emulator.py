"""Execute compiled ROMs in PyBoy and check RAM, tile maps and input behavior."""
import json
import io
import sys
import struct
import zlib
from pathlib import Path
from pyboy import PyBoy


def run_case(case):
    symbols = {}
    for line in Path(case['symbols']).read_text().splitlines():
        if not line or line.startswith(';'):
            continue
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
    emulator = PyBoy(case['rom'], window='null',
                     symbols=case['symbols'], cgb=case.get('cgb', False), sound_emulated=case.get('audio', False),
                     ram_file=io.BytesIO(Path(case['ram_in']).read_bytes()) if case.get('ram_in') else None)
    emulator.set_emulation_speed(0)

    captures = {}
    call_counts = dict.fromkeys(case.get('monitor_calls', []), 0)
    def record_call(name):
        call_counts[name] += 1
    for name in call_counts:
        emulator.hook_register(None, name, record_call, name)
    write_violations = []
    def verify_vblank_write(_):
        if not emulator.memory[symbols['wStreamLCDPaused']] and emulator.memory[0xff44] < 144:
            write_violations.append(emulator.memory[0xff44])
    if case.get('check_stream_writes'):
        emulator.hook_register(None, 'StreamUpdateByte.write', verify_vblank_write, None)
        def verify_async_write(_):
            if emulator.memory[0xff41] & 3 == 3:
                write_violations.append(('async mode 3', emulator.memory[0xff44]))
        emulator.hook_register(None, 'StreamWriteAccessible.write', verify_async_write, None)

    def check_stream_view():
        world = case.get('streamed_world')
        if not world:
            return
        coordinates = []
        for symbol, register in [('wCameraX', 0xff43), ('wCameraY', 0xff42)]:
            address = symbols[symbol]
            queued = emulator.memory[address] | emulator.memory[address + 1] << 8
            delta = ((queued & 255) - emulator.memory[register] + 128) % 256 - 128
            coordinates.append(queued - delta)
        cx, cy = coordinates
        visible = set()
        for y in range(cy // 8, (cy + world.get('view_height', 128) - 1) // 8 + 1):
            for x in range(cx // 8, (cx + 159) // 8 + 1):
                tile_id = world['ids'][y * world['width'] + x]
                slot = world['slots'][tile_id]
                actual = emulator.memory[0, 0x9800 + (y % 32) * 32 + x % 32]
                assert actual == slot, f"{case['name']}: visible cell {x},{y}: {actual} != {slot}"
                if case.get('cgb') and world.get('palettes'):
                    actual_palette = emulator.memory[1, 0x9800 + (y % 32) * 32 + x % 32]
                    assert actual_palette == world['palettes'][y * world['width'] + x], f"{case['name']}: visible palette {x},{y} changed"
                visible.add(tile_id)
        for tile_id in visible:
            address = 0x8000 + world['slots'][tile_id] * 16
            assert list(emulator.memory[0, address:address + 16]) == world['tiles'][tile_id], f"{case['name']}: visible graphics {tile_id} overwritten"

    def check(expected):
        assert not write_violations, f"{case['name']}: streamed writes outside VBlank: {write_violations}"
        for name, count in expected.get('call_counts', {}).items():
            assert call_counts[name] == count, f"{case['name']}: calls to {name}: {call_counts[name]} != {count}"
        for name, values in expected.get('arrays', {}).items():
            base = symbols[case['symbolNames'][name]]
            actual = []
            for index in range(len(values)):
                address = base + index * 2
                value = emulator.memory[address] | emulator.memory[address + 1] << 8
                actual.append(value - 65536 if value >= 32768 else value)
            assert actual == values, f"{case['name']}: array {name}: {actual} != {values}"
        for name, value in expected.get('variables', {}).items():
            address = symbols[case['symbolNames'][name]]
            actual = emulator.memory[address] | emulator.memory[address + 1] << 8
            if actual >= 32768:
                actual -= 65536
            assert actual == value, f"{case['name']}: {name}: {actual} != {value}"
        for name, limits in expected.get('ranges', {}).items():
            address = symbols[case['symbolNames'][name]]
            actual = emulator.memory[address] | emulator.memory[address + 1] << 8
            if actual >= 32768:
                actual -= 65536
            assert limits[0] <= actual <= limits[1], f"{case['name']}: {name}: {actual} not in {limits}"
        for row in expected.get('rows', []):
            base = 0x9c00 if emulator.memory[0xff40] & 8 else 0x9800
            address = base + row['y'] * 32 + row['x']
            actual = list(emulator.memory[address:address + len(row['tiles'])])
            assert actual == row['tiles'], f"{case['name']}: text at ({row['x']}, {row['y']}): {actual} != {row['tiles']}"
        for row in expected.get('attributes', []):
            base = 0x9c00 if emulator.memory[0xff40] & 8 else 0x9800
            address = base + row['y'] * 32 + row['x']
            actual = list(emulator.memory[1, address:address + len(row['values'])])
            assert actual == row['values'], f"{case['name']}: attributes: {actual} != {row['values']}"
        if 'window_enabled' in expected:
            assert bool(emulator.memory[0xff40] & 32) == expected['window_enabled'], f"{case['name']}: window enable"
        for field, key, bank in [('window_rows', 'tiles', 0), ('window_attributes', 'values', 1)]:
            for row in expected.get(field, []):
                base = 0x9c00 if emulator.memory[0xff40] & 64 else 0x9800
                address = base + row['y'] * 32 + row['x']
                actual = list(emulator.memory[bank, address:address + len(row[key])]) if bank else list(emulator.memory[address:address + len(row[key])])
                assert actual == row[key], f"{case['name']}: {field}: {actual} != {row[key]}"
        for region in expected.get('capture_regions', []):
            x, y, width, height = (region[k] for k in ('x', 'y', 'width', 'height'))
            captures[region['name']] = (x, y, width, height, emulator.screen.ndarray[y:y + height, x:x + width, :3].tobytes())
        for region in expected.get('compare_regions', []):
            x, y, width, height, baseline = captures[region['name']]
            actual = emulator.screen.ndarray[y:y + height, x:x + width, :3].tobytes()
            assert (actual == baseline) == region.get('equal', True), f"{case['name']}: screen region {region['name']}"
        for item in expected.get('registers', []):
            actual = emulator.memory[item['address']] & item.get('mask', 255)
            assert actual == item['value'], f"{case['name']}: register {item['address']:04x}: {actual} != {item['value']}"
        if 'audio_varies' in expected:
            samples = emulator.sound.ndarray
            varying = bool(len(samples) and int(samples.max()) != int(samples.min()))
            assert varying == expected['audio_varies'], f"{case['name']}: audio varies={varying}"
        for item in expected.get('bytes', []):
            address = symbols[item['symbol']] if 'symbol' in item else item['address']
            address += item.get('offset', 0)
            actual = list(emulator.memory[address:address + len(item['values'])])
            assert actual == item['values'], f"{case['name']}: memory at {address:04x}: {actual} != {item['values']}"
        for palette in expected.get('palettes', []):
            selector = 0xff68 if palette['kind'] == 'background' else 0xff6a
            original = emulator.memory[selector]
            colors = []
            for color in range(4):
                emulator.memory[selector] = palette['index'] * 8 + color * 2
                low = emulator.memory[selector + 1]
                emulator.memory[selector] = palette['index'] * 8 + color * 2 + 1
                colors.append(low | emulator.memory[selector + 1] << 8)
            emulator.memory[selector] = original
            assert colors == palette['colors'], f"{case['name']}: palette {palette['index']}: {colors} != {palette['colors']}"

    try:
        emulator.tick(case.get('frames', 150), True)
        check(case)
        for step in case.get('steps', []):
            for item in step.get('set_bytes', []):
                address = symbols[item['symbol']] if 'symbol' in item else item['address']
                address += item.get('offset', 0)
                for offset, value in enumerate(item['values']):
                    emulator.memory[address + offset] = value
            for name, value in step.get('set', {}).items():
                address = symbols[case['symbolNames'][name]]
                emulator.memory[address] = value & 255
                emulator.memory[address + 1] = (value >> 8) & 255
            for button in step.get('press', []):
                emulator.button_press(button)
            for button in step.get('release', []):
                emulator.button_release(button)
            if step.get('lcd_stays_enabled'):
                movement = step.get('movement')
                previous_position = None
                still_frames = 0
                for _ in range(step.get('frames', 8)):
                    emulator.tick(1, True)
                    assert emulator.memory[0xff40] & 128, f"{case['name']}: LCD disabled during movement"
                    check_stream_view()
                    if movement:
                        address = symbols[case['symbolNames'][movement['variable']]]
                        position = emulator.memory[address] | emulator.memory[address + 1] << 8
                        still_frames = still_frames + 1 if position == previous_position else 0
                        previous_position = position
                        assert still_frames <= movement['max_still_frames'], f"{case['name']}: movement stalled for {still_frames} frames at {position}, step={step.get('press')}, phase={emulator.memory[symbols['wStreamPhase']]}, remaining={emulator.memory[symbols['wStreamTileCount']]}, scan={emulator.memory[symbols['wStreamScan']] | emulator.memory[symbols['wStreamScan'] + 1] << 8}"
                    if step.get('camera_keeps_up'):
                        for axis in ['X', 'Y']:
                            camera = symbols['wCamera' + axis]
                            wanted = symbols['wStreamWanted' + axis]
                            actual = emulator.memory[camera] | emulator.memory[camera + 1] << 8
                            target = emulator.memory[wanted] | emulator.memory[wanted + 1] << 8
                            # Avoid sampling the two-instruction word store across a byte rollover.
                            if abs(actual - target) < 128:
                                assert abs(actual - target) <= 4, f"{case['name']}: camera {axis} fell {abs(actual - target)} pixels behind at {target}, phase={emulator.memory[symbols['wStreamPhase']]}, remaining={emulator.memory[symbols['wStreamTileCount']]}, scan={emulator.memory[symbols['wStreamScan']] | emulator.memory[symbols['wStreamScan'] + 1] << 8}, step={step.get('press')}"
            else:
                emulator.tick(step.get('frames', 8), True)
            check(step)
        # Save the emulator framebuffer as PNG without another dependency.
        if case.get('screenshot'):
            pixels = emulator.screen.ndarray
            target = Path(case['screenshot'])
            def chunk(kind, data):
                return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
            rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(144))
            target.write_bytes(b'\x89PNG\r\n\x1a\n'
                               + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 144, 8, 2, 0, 0, 0))
                               + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
    finally:
        if case.get('ram_out'):
            with Path(case['ram_out']).open('wb') as ram_file:
                emulator.stop(save=True, ram_file=ram_file, rtc_file=io.BytesIO())
        else:
            emulator.stop(save=False)
    print(f"PASS: {case['name']}")


for item in json.loads(Path(sys.argv[1]).read_text()):
    run_case(item)
