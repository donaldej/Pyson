'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('music emits only referenced tracks and supports options, rests and shared modules', () => {
  const silent = compile('unused = music_track([[440, 8, 10]])');
  assert.equal(silent.musicEnabled, false);
  assert.deepEqual(silent.music, []);
  assert.doesNotMatch(silent.assembly, /MusicTick:|wMusicActive:|InitSound:/);
  const source = 'song = music_track([[440, 8, 10], [0, 2, 15]], loop=False, duty=1)\nplay_music(song)\nplay_music(song, restart=True)';
  const used = compile(source);
  assert.equal(used.soundEnabled, true);
  assert.deepEqual(used.music[0].bytes, [0, 64, 2, 8, 160, 214, 6, 2, 0, 0, 0]);
  assert.equal((used.assembly.match(/MusicTrack0:/g) || []).length, 1);
  const directory = path.resolve(__dirname, '../build/tests/music-modules');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'songs.pysn'), 'song = music_track([[440, 8, 10]])\ndef start():\n    play_music(song)');
  const shared = compile('import songs as songs\nsongs.start()\nplay_music(songs.song)', path.join(directory, 'main.pysn'));
  assert.equal(shared.music.length, 1);
  assert.equal(shared.music[0].name, 'songs.song');
});

test('music validates notes, options, static bindings and playback signatures', () => {
  const bad = ['song = music_track([])', 'song = music_track([[63, 2, 10]])',
    'song = music_track([[440, 0, 10]])', 'song = music_track([[440, 2, 16]])',
    'song = music_track([[440, 2]])', 'song = music_track([[440, 2, 10]], loop=1)',
    'song = music_track([[440, 2, 10]], duty=4)', 'song = music_track([[440, 2, 10]], other=True)',
    'song = music_track([[440, 2, 10]], True, loop=False)',
    'def f():\n    song = music_track([[440, 2, 10]])', 'play_music("song")',
    'song = music_track([[440, 2, 10]])\nalias = song',
    'song = music_track([[440, 2, 10]])\nsong = 1',
    'song = music_track([[440, 2, 10]])\nplay_music(song, unknown=True)',
    'song = music_track([[440, 2, 10]])\ndef f(song):\n    play_music(song)\nf(1)',
    'pause_music(1)', 'resume_music(1)', 'stop_music(1)', 'music_playing(1)',
    'song = music_track([[440, 2, 10]])\nplay_music(song, "yes")'];
  for (const source of bad) assert.throws(() => compile(source), undefined, source);
  assert.throws(() => compile(`song = music_track([${Array(256).fill('[440, 2, 10]').join(',')}])`), /255/);
});
