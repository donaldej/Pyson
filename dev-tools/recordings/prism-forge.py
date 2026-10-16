"""Optional developer tool: record Prism Forge with synchronized audio."""
import argparse
import json
import io
import os
from pathlib import Path
import shutil
import subprocess
import wave

import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=root / 'binary/prism-forge.mp4')
parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
args = parser.parse_args()
if not args.ffmpeg:
    candidate = Path(os.environ.get('LOCALAPPDATA', '')) / 'ffmpeg/ffmpeg.exe'
    if candidate.is_file():
        args.ffmpeg = str(candidate)
if not args.ffmpeg:
    parser.error('Install FFmpeg or pass --ffmpeg with the path to its executable.')

report_path = root / 'build/prism-forge.report.json'
if not report_path.is_file():
    parser.error('Build first: npm.cmd run build -- examples/prism-forge/main.pysn prism-forge')
report = json.loads(report_path.read_text())
addresses = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
symbols = {}
for line in (root / 'build/prism-forge.sym').read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)

output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
work = root / 'build/prism-record'
work.mkdir(parents=True, exist_ok=True)
silent_video = work / 'video.mp4'
audio_path = work / 'audio.wav'
fps = 4194304 / 70224
emulator = PyBoy(str(root / 'binary/prism-forge.gb'), window='null', cgb=True, sound_emulated=True, ram_file=io.BytesIO(bytes([255]) * 8192))
emulator.set_emulation_speed(0)

def word(name):
    address = addresses[name]
    return emulator.memory[address] | emulator.memory[address + 1] << 8

encoder = subprocess.Popen([
    args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '160x144',
    '-framerate', '262144/4389', '-i', 'pipe:0', '-an',
    '-vf', 'scale=640:576:flags=neighbor', '-c:v', 'libx264', '-preset', 'medium',
    '-crf', '16', '-pix_fmt', 'yuv420p', str(silent_video)
], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
frame_count = 0
sample_count = 0
started = False
peak = 0
try:
    with wave.open(str(audio_path), 'wb') as audio_file:
        rate = emulator.sound.sample_rate
        audio_file.setnchannels(2)
        audio_file.setsampwidth(2)
        audio_file.setframerate(rate)
        for _ in range(14000):
            emulator.tick(1, True)
            if not started:
                started = word('scene') == 0 and emulator.memory[symbols['wMusicActive']] == 1
                if not started:
                    continue
            if word('cycles') >= 1:
                break
            encoder.stdin.write(emulator.screen.ndarray[:, :, :3].tobytes())
            frame_count += 1
            # PyBoy supplies integer-sized audio chunks. Reconcile them with the
            # exact hardware frame duration to prevent cumulative A/V drift.
            target = round(frame_count * rate / fps)
            needed = target - sample_count
            samples = emulator.sound.ndarray.astype(np.float64)
            if len(samples):
                positions = np.linspace(0, len(samples) - 1, needed)
                resampled = np.column_stack([
                    np.interp(positions, np.arange(len(samples)), samples[:, channel])
                    for channel in range(2)
                ])
                pcm = np.rint(resampled * 256).clip(-32768, 32767).astype('<i2')
                peak = max(peak, int(np.abs(pcm.astype(np.int32)).max()))
            else:
                pcm = np.zeros((needed, 2), dtype='<i2')
            audio_file.writeframesraw(pcm.tobytes())
            sample_count = target
        else:
            raise RuntimeError('Demo did not finish within the recording frame budget.')
finally:
    emulator.stop(save=False)
    encoder.stdin.close()
    error = encoder.stderr.read().decode(errors='replace')
    status = encoder.wait()
if status:
    raise RuntimeError(f'FFmpeg video encoding failed: {error}')
if not frame_count or not peak:
    raise RuntimeError('Recording has no frames or audible samples.')
subprocess.run([
    args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
    '-i', str(silent_video), '-i', str(audio_path), '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    '-shortest', str(output)
], check=True)
print(json.dumps({'video': str(output), 'frames': frame_count,
                  'seconds': round(frame_count / fps, 3), 'audio_samples': sample_count,
                  'audio_peak': peak, 'bytes': output.stat().st_size}))
