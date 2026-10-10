'use strict';
const { evaluateArguments, reordered } = require('./builtin-arguments');
const fs = require('node:fs');
const path = require('node:path');
const procedures = ['play_music', 'stop_music', 'pause_music', 'resume_music'];
const names = [...procedures, 'music_track', 'music_file', 'music_playing'];
function collectMusic(ast) {
  const custom = new Map(), calls = new Map(), used = new Map();
  let enabled = false;
  const fail = (n, m) => { throw new Error(`${n.filename || '<source>'}: Line ${n.line}: ${m}`); };
  const integer = (n, lo, hi) => {
    if (n?.type !== 'number' || !Number.isInteger(n.value) || n.value < lo || n.value > hi) fail(n || {}, `Music requires literal integers ${lo}..${hi}`);
    return n.value;
  };
  function walk(n, visit) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(x => walk(x, visit));
    visit(n);
    Object.values(n).forEach(x => { if (x && typeof x === 'object') walk(x, visit); });
  }
  for (const statement of ast) walk(statement, node => {
    if (node.type !== 'call' || !['music_track', 'music_file'].includes(node.name)) return;
    if (statement.type !== 'assign' || statement.expression !== node) fail(node, 'music_track requires a top-level assignment');
    let args = node.args;
    if (node.name === 'music_file') {
      if (args.length < 1 || args.length > 2 || args[0].type !== 'string') fail(node, 'music_file expects a literal JSON path and optional part index');
      const option = args[1];
      if (option?.type === 'keyword' && option.name !== 'part') fail(node, 'music_file supports only the part keyword');
      const part = option ? integer(option.type === 'keyword' ? option.expression : option, 0, 255) : 0;
      let data;
      try { data = JSON.parse(fs.readFileSync(path.resolve(path.dirname(node.filename || '.'), args[0].value), 'utf8')); } catch (error) { fail(node, `Cannot load music file: ${error.message}`); }
      if (data.parts) data = data.parts[part]; else if (part !== 0) fail(node, 'Music part is outside this file');
      if (!data || !Array.isArray(data.notes)) fail(node, 'Music JSON requires notes or indexed parts with notes');
      const ast = value => ({ ...(Array.isArray(value) ? { type: 'list', items: value.map(ast) } : { type: typeof value === 'boolean' ? 'boolean' : typeof value === 'string' ? 'string' : 'number', value }), line: node.line, filename: node.filename });
      args = [ast(data.notes), ...Object.entries(data).filter(([key]) => ['loop', 'duty', 'voice', 'instrument'].includes(key)).map(([name, value]) => ({ type: 'keyword', name, expression: ast(value) }))];
    }
    if (args.length < 1 || args.length > 5 || args[0].type !== 'list') fail(node, 'music_track expects notes and optional loop, duty, voice, instrument');
    const options = { loop: { type: 'boolean', value: true }, duty: { type: 'number', value: 2 }, voice: { type: 'number', value: 0 }, instrument: { type: 'string', value: 'triangle' } };
    const seen = new Set();
    let keyword = false;
    args.slice(1).forEach((arg, i) => {
      const key = arg.type === 'keyword' ? arg.name : ['loop', 'duty', 'voice', 'instrument'][i];
      if (arg.type === 'keyword') keyword = true;
      else if (keyword) fail(node, 'Music positional arguments must precede keywords');
      if (!Object.hasOwn(options, key) || seen.has(key)) fail(node, 'Unknown or duplicate music option');
      seen.add(key); options[key] = arg.type === 'keyword' ? arg.expression : arg;
    });
    if (options.loop.type !== 'boolean') fail(node, 'Music loop must be literal True or False');
    const duty = integer(options.duty, 0, 3);
    const voice = integer(options.voice, 0, 1);
    let waveform;
    if (voice === 1) {
      const patterns = { triangle: Array.from({ length: 32 }, (_, i) => i < 16 ? i : 31 - i), square: Array.from({ length: 32 }, (_, i) => i < 16 ? 15 : 0), saw: Array.from({ length: 32 }, (_, i) => i >> 1), sine: Array.from({ length: 32 }, (_, i) => Math.round(7.5 + 7.5 * Math.sin(i * Math.PI / 16))) };
      const instrument = options.instrument;
      const samples = instrument.type === 'list' ? instrument.items.map(n => integer(n, 0, 15)) : instrument.type === 'string' && patterns[instrument.value];
      if (!samples || samples.length !== 32) fail(node, 'Wave instrument must be triangle, square, saw, sine, or 32 samples of 0..15');
      waveform = Array.from({ length: 16 }, (_, i) => samples[i * 2] << 4 | samples[i * 2 + 1]);
    } else if (seen.has('instrument')) fail(node, 'Wave instruments require voice=1; pulse music uses duty');
    if (!args[0].items.length || args[0].items.length > 255) fail(node, 'Music requires 1..255 notes');
    const steps = args[0].items.map(row => {
      if (row.type !== 'list' || row.items.length !== 3) fail(row, 'Music notes must be [Hz, ticks, volume]');
      const pitch = integer(row.items[0], 0, 20000);
      if (pitch && pitch < 64) fail(row, 'Music pitch must be 0 (rest) or 64..20000 Hz');
      return [pitch, integer(row.items[1], 1, 255), integer(row.items[2], 0, 15)];
    });
    if (custom.has(statement.name)) fail(node, 'Duplicate music_track declaration');
    const track = { name: statement.name, loop: options.loop.value, duty, voice, waveform, steps, label: `MusicTrack${custom.size}` };
    track.bytes = [track.loop ? 1 : 0, duty << 6, steps.length, ...steps.flatMap(([hz, ticks, volume]) => {
      const period = hz ? Math.max(0, Math.min(2047, 2048 - Math.round((voice ? 65536 : 131072) / hz))) : 0;
      const amplitude = !hz || !volume ? 0 : voice ? volume >= 8 ? 0x20 : volume >= 4 ? 0x40 : 0x60 : volume << 4;
      return [ticks, amplitude, period & 255, period >> 8];
    }), ...(waveform || [])];
    custom.set(statement.name, track); calls.set(node, track);
  });
  walk(ast, node => {
    if (node.type !== 'call') return;
    if (procedures.includes(node.name) || node.name === 'music_playing') enabled = true;
    if (node.name !== 'play_music') return;
    const track = node.args[0]?.type === 'name' && custom.get(node.args[0].name);
    if (!track) fail(node, 'play_music requires a named music_track');
    calls.set(node, track); used.set(track.label, track);
  });
  return { custom, calls, used, enabled, waveEnabled: [...used.values()].some(track => track.voice === 1) };
}
function emitMusic(node, context, helpers, music) {
  if (!names.includes(node.name)) return null;
  const { fail, expression, numeric, typeOf } = helpers;
  const sync = helpers.frameClock ? ['    call SyncFrameAudio'] : [];
  if (['music_track', 'music_file'].includes(node.name)) {
    const track = music.calls.get(node);
    if (!track) fail(node, 'music_track requires a top-level assignment');
    return [`    ld hl, ${music.used.has(track.label) ? track.label : 0}`];
  }
  if (node.name === 'play_music') {
    if (node.args.length < 1 || node.args.length > 2 || typeOf(node.args[0], context.scope) !== 'music') fail(node, 'play_music expects (named_track[, restart=False])');
    let restart = node.args[1] || { type: 'number', value: 0 };
    if (restart.type === 'keyword') {
      if (restart.name !== 'restart') fail(node, 'play_music supports only restart keyword');
      restart = restart.expression;
    }
    numeric(restart, context);
    const track = music.calls.get(node);
    const args = [node.args[0], restart];
    const code = reordered(node, args) ? [...evaluateArguments(node, args, context, expression), '    pop hl']
      : [...expression(args[0], context), '    push hl', ...expression(restart, context)];
    return [...code, '    ld a, h', '    or l', '    pop hl', ...sync, `    call ${track.voice ? 'PlayWaveMusic' : 'PlayMusic'}`, '    ld hl, 0'];
  }
  if (node.args.length) fail(node, `${node.name} expects no arguments`);
  const routine = { stop_music: 'StopMusic', pause_music: 'PauseMusic', resume_music: 'ResumeMusic', music_playing: 'MusicPlaying' }[node.name];
  if (music.waveEnabled) {
    if (node.name === 'music_playing') return [...sync, '    call MusicPlaying', '    push hl', '    call WaveMusicPlaying', '    pop de', '    ld a, l', '    or e', '    ld l, a', '    ld h, 0'];
    return [...sync, `    call ${routine}`, `    call ${routine.replace('Music', 'WaveMusic')}`, '    ld hl, 0'];
  }
  return [...sync, `    call ${routine}`, ...(node.name === 'music_playing' ? [] : ['    ld hl, 0'])];
}
module.exports = { names, procedures, collectMusic, emitMusic };
