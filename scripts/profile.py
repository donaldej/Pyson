"""Measure guest CPU work, display commits, and source visits without changing Pyson code."""
import io
import hashlib
import json
from collections import Counter
from pathlib import Path
import sys
from pyboy import PyBoy

config = json.loads(Path(sys.argv[1]).read_text())
# A file-like ROM and fresh in-memory RAM prevent loading or modifying user saves.
emulator = PyBoy(io.BytesIO(Path(config['rom']).read_bytes()), symbols=config['symbols'], window='null',
                 cgb=config['target'] == 'cgb', sound_emulated=True,
                 ram_file=io.BytesIO(bytes([255]) * max(8192, config['ramBytes'])))
emulator.set_emulation_speed(0)
if not callable(getattr(emulator, '_cycles', None)):
    raise RuntimeError('The pinned emulator cycle counter is unavailable; reinstall setup:emulator.')

symbols = {}
for line in Path(config['symbols']).read_text().splitlines():
    if line and not line.startswith(';'):
        position, name = line.split()
        bank, address = position.split(':')
        symbols[name] = (int(bank, 16), int(address, 16))

mode = 'startup'
last_cycle = emulator._cycles()
totals = Counter()
visits = Counter()
counts = Counter()
hooks = {}
started = False
idle_program = False
recording = False
refresh_previous = None
intervals = []

def advance(new_mode=None):
    global last_cycle, mode
    now = emulator._cycles()
    if recording:
        totals[mode] += now - last_cycle
    last_cycle = now
    if new_mode is not None:
        mode = new_mode

def begin(_):
    global started
    started = True
    advance('work')

def refresh(_):
    global refresh_previous
    if recording:
        counts['refresh_calls'] += 1
        now = emulator._cycles()
        if refresh_previous is not None:
            intervals.append(now - refresh_previous)
        refresh_previous = now

def commit(_):
    if recording:
        counts['display_commits'] += 1

def idle(_):
    global idle_program
    idle_program = True
    advance('idle')

def tick():
    emulator.tick(1, False)

def add_hook(position, callback, context=None):
    hooks.setdefault(position, []).append((callback, context))

add_hook(symbols['MainStart'], begin)
add_hook(symbols['RefreshScreen'], refresh)
add_hook(symbols['CommitGraphicsFrame'], commit)
add_hook(symbols['WaitVBlank.leave'], lambda _: advance('wait'))
add_hook(symbols['WaitVBlank.return'], lambda _: advance('idle' if idle_program else 'work'))
# Mark post-main execution before its final refresh. Hooking the self-jump in
# ProgramIdle can stall the emulator's breakpoint reinjection indefinitely.
add_hook(symbols['MainFinish'], idle)

# Several declaration labels can share one instruction. Count the final source
# checkpoint at that address once, rather than crediting every alias.
sources = {}
omitted = 0
for source in config['report']['sources']:
    if source['bank'] > 255:
        omitted += 1  # PyBoy's current hook key encodes only eight bank bits.
        continue
    sources[(source['bank'], source['address'])] = source

def visit(key):
    if recording:
        visits[key] += 1

for key in sources:
    add_hook(key, visit, key)

def dispatch(callbacks):
    for callback, context in callbacks:
        callback(context)

for (bank, address), callbacks in hooks.items():
    emulator.hook_register(bank, address, dispatch, callbacks)

frames = []
try:
    for _ in range(600):
        tick()
        if started:
            break
    else:
        raise RuntimeError('Program initialization did not finish within 600 hardware frames.')
    for _ in range(config['warmup']):
        tick()
    advance()
    recording = True
    for _ in range(config['frames']):
        before = totals.copy()
        before_counts = counts.copy()
        tick()
        advance()
        frames.append({ 'work_cycles': totals['work'] - before['work'], 'wait_cycles': totals['wait'] - before['wait'],
                        'idle_cycles': totals['idle'] - before['idle'],
                        'display_commits': counts['display_commits'] - before_counts['display_commits'] })
    total = sum(totals.values())
    cpu_frame = 140448 if emulator.memory[0xff4d] & 128 and config['target'] == 'cgb' else 70224
    ordered = sorted(intervals)
    def percentile(fraction):
        return round(ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))] / cpu_frame, 3) if ordered else None
    output = {
        'target': config['target'], 'hardware_frames': len(frames), 'warmup_frames': config['warmup'],
        'cpu_speed': 'double' if cpu_frame == 140448 else 'normal',
        'seconds': round(len(frames) * 70224 / 4194304, 3), 'cpu_cycles': total,
        'work_percent': round(100 * totals['work'] / total, 2),
        'wait_percent': round(100 * totals['wait'] / total, 2), 'idle_percent': round(100 * totals['idle'] / total, 2),
        'refresh_calls': counts['refresh_calls'], 'display_commits': counts['display_commits'],
        'frames_without_display_commit': sum(frame['display_commits'] == 0 for frame in frames),
        'refresh_interval_frames': { 'median': percentile(0.5), 'p95': percentile(0.95), 'maximum': percentile(1) },
        'memory': { k: config['report'][k] for k in ['romBytes', 'wramUsedBytes', 'wramFreeBytes'] },
        'final_cpu_cycles': emulator._cycles(),
        'final_wram_sha256': hashlib.sha256(bytes(emulator.memory[0xc000:0xd000])).hexdigest(),
        'source_visits': [{ **sources[key], 'visits': value } for key, value in visits.most_common(20)],
        'omitted_source_checkpoints': omitted, 'frames': frames,
        'limitations': ['Work includes graphics, audio and other runtime execution; source visits are counts, not per-line CPU costs.',
                       'Frames without a commit can be intentional. This measurement does not declare them missed deadlines.',
                       'This is one emulated execution with no button input and fresh save RAM; it does not certify hardware performance.']
    }
    Path(config['output']).write_text(json.dumps(output, indent=2))
    print(f"{config['target'].upper()}: {len(frames)} hardware frames; work {output['work_percent']}%, wait {output['wait_percent']}%, idle {output['idle_percent']}%")
    print(f"Display commits: {output['display_commits']}; refresh interval (frames): {output['refresh_interval_frames']}")
    for site in output['source_visits'][:5]:
        print(f"  {Path(site['filename']).name}:{site['line']}: {site['visits']} source visits")
finally:
    emulator.stop(save=False)
