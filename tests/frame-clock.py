"""Compare guest frame time with physical emulator frames, including rollover."""
import io
import json
import sys
from pathlib import Path
from pyboy import PyBoy

results = []
for config in json.loads(Path(sys.argv[1]).read_text()):
    symbols = {}
    for line in Path(config['symbols']).read_text().splitlines():
        if line and not line.startswith(';'):
            address, name = line.split()
            symbols[name] = int(address.split(':')[1], 16)
    variables = {v['name']: v['address'] for v in config['variables'] if v['scope'] == '$module'}
    emulator = PyBoy(io.BytesIO(Path(config['rom']).read_bytes()), symbols=config['symbols'], window='null', cgb=config['cgb'], sound_emulated=True)
    emulator.set_emulation_speed(0)
    started = []
    def read(at):
        return emulator.memory[at] | emulator.memory[at + 1] << 8
    def word(name):
        return read(variables[name])
    def begin(_):
        started.append(True)
        if config['kind'] == 'wrap':
            for name in ['wFrameCount', 'wFrameAudioCursor']:
                at = symbols[name]
                emulator.memory[at] = 253
                emulator.memory[at + 1] = 127
    emulator.hook_register(None, 'MainStart', begin, None)
    finished = []
    def finish(_):
        finished.append({'music': emulator.memory[symbols['wMusicFrames']],
                         'sound': emulator.memory[symbols['wSoundFrames']],
                         'clock': read(symbols['wFrameCount']),
                         'cursor': read(symbols['wFrameAudioCursor'])})
    if config['kind'] == 'arguments':
        emulator.hook_register(None, 'MainFinish', finish, None)
    baseline = None
    sound_seen = False
    audio_seen = False
    elapsed_frames = 0
    heavy_start = None
    try:
        for frame in range(400):
            emulator.tick(1, True)
            if not started:
                continue
            elapsed_frames += 1
            clock = read(symbols['wFrameCount'])
            if config['kind'] == 'arguments':
                if finished:
                    state = finished[0]
                    assert word('music_start') > word('start')
                    assert state['sound'] == 60, state
                    assert state['music'] == 60 - ((state['cursor'] - word('music_start')) & 32767), state
                    results.append({'case': config['name'], 'sound_ticks_at_start': state['sound']})
                    break
            elif config['kind'] == 'demo':
                if elapsed_frames == 90:
                    emulator.button_press('a')
                if elapsed_frames == 110:
                    assert word('work_count') == 700
                    heavy_start = (clock, word('timeline'))
                if elapsed_frames == 210:
                    traveled = (word('timeline') - heavy_start[1]) % 576
                    assert abs(traveled - (clock - heavy_start[0])) <= 12
                    assert emulator.sound.ndarray.any()
                if elapsed_frames == 220:
                    emulator.button_release('a')
                if elapsed_frames == 240:
                    assert word('work_count') == 40
                    assert emulator.memory[0xfe00] == 96
                    if config.get('window'):
                        assert emulator.memory[0xff40] & 0x60 == 0x60
                        at = symbols['wWindowTiles']
                        assert bytes(emulator.memory[0x9c00:0x9c14]) == bytes(emulator.memory[at:at+20])
                    results.append({'case': config['name'], 'heavy_workload_elapsed_movement': traveled})
                    break
            elif config['kind'] == 'wrap':
                if word('done'):
                    assert word('start') == 32765
                    assert 6 <= word('delta') <= 7
                    assert word('invalid') == 0
                    assert clock < 10
                    results.append({'case': config['name'], 'elapsed_across_rollover': word('delta')})
                    break
            else:
                sound_seen |= bool(emulator.memory[symbols['wSoundActive']])
                audio_seen |= bool(emulator.sound.ndarray.any())
                if baseline is None and elapsed_frames >= 30:
                    baseline = (frame, clock)
                if baseline:
                    assert (clock - baseline[1]) & 32767 == frame - baseline[0], (config['name'], frame, clock, baseline)
                cursor = read(symbols['wFrameAudioCursor'])
                if cursor >= 50:
                    expected = 20 - cursor % 20
                    assert emulator.memory[symbols['wMusicFrames']] == expected, (config['name'], cursor, expected, emulator.memory[symbols['wMusicFrames']])
                    assert emulator.memory[symbols['wWaveMusicFrames']] == expected
                    assert emulator.memory[symbols['wSoundActive']] == 0
                if elapsed_frames >= 220:
                    assert sound_seen and audio_seen
                    assert word('updates') > 5
                    assert abs(word('elapsed') - clock) <= 15
                    assert word('position') == word('elapsed') % 144
                    assert word('previous') == word('elapsed')
                    assert word('elapsed') > word('updates') * 2
                    assert emulator.memory[0xfe00] == 86
                    results.append({'case': config['name'], 'hardware_frames': clock, 'game_updates': word('updates'), 'movement_frames': word('elapsed')})
                    break
        else:
            raise AssertionError(f"{config['name']} timed out")
    finally:
        emulator.stop(save=False)
print(json.dumps(results))
