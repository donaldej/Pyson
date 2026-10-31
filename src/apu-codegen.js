'use strict';
// Optional, banked register streams for imported audio. Ordinary games should
// continue to use music_file/music_track and sound_effect.
const fs = require('node:fs');
const path = require('node:path');
const procedures = ['play_audio', 'stop_audio'];
const names = [...procedures, 'audio_file'];
function collect(ast, graphics) {
  const calls = new Map(), definitions = new Map(), used = new Set();
  let enabled = false;
  const fail = (n, m) => { throw new Error(`${n.filename || '<source>'}: Line ${n.line}: ${m}`); };
  function walk(n, fn) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(x => walk(x, fn));
    fn(n); Object.values(n).forEach(x => { if (x && typeof x === 'object') walk(x, fn); });
  }
  for (const statement of ast) walk(statement, n => {
    if (n.type !== 'call' || n.name !== 'audio_file') return;
    if (statement.type !== 'assign' || statement.expression !== n || n.args.length !== 1 || n.args[0].type !== 'string') fail(n, 'audio_file requires a top-level assignment and literal JSON path');
    let data;
    try { data = JSON.parse(fs.readFileSync(path.resolve(path.dirname(n.filename || '.'), n.args[0].value), 'utf8')); }
    catch (e) { fail(n, `Cannot load audio file: ${e.message}`); }
    if (data.format !== 'pyson-apu-1' || !Array.isArray(data.events) || !Number.isInteger(data.frames) || data.frames < 1 || data.frames > 1000000) fail(n, 'Audio JSON requires format pyson-apu-1, frames 1..1000000, and events');
    if (data.loop !== undefined && (!Number.isInteger(data.loop) || data.loop < 0 || data.loop >= data.frames)) fail(n, 'Audio loop must be a frame inside the stream');
    let last = -1;
    for (const e of data.events) {
      if (!Array.isArray(e) || e.length !== 3 || !e.every(Number.isInteger) || e[0] < last || e[0] < 0 || e[0] >= data.frames || e[1] < 0x10 || e[1] > 0x3f || e[2] < 0 || e[2] > 255 || [0x15,0x1f,0x27,0x28,0x29,0x2a,0x2b,0x2c,0x2d,0x2e,0x2f].includes(e[1])) fail(n, 'Audio events must be ordered [frame, APU register offset, byte] triples');
      last = e[0];
    }
    if (definitions.has(statement.name)) fail(n, 'audio_file bindings cannot be redeclared');
    const def = { name: statement.name, label: `APUDefinition${definitions.size}`, data, node: n };
    definitions.set(statement.name, def); calls.set(n, def);
  });
  walk(ast, n => {
    if (n.type === 'call' && procedures.includes(n.name)) enabled = true;
    if (n.type !== 'call' || n.name !== 'play_audio') return;
    const def = n.args[0]?.type === 'name' && definitions.get(n.args[0].name);
    if (!def) fail(n, 'play_audio requires a named audio_file');
    calls.set(n, def); used.add(def);
  });
  const objects = [];
  for (const def of used) {
    // Each chunk ends with an absolute bank/address link. No read crosses $8000.
    const parts = []; let bytes = [], frame = 0;
    def.mask = def.data.events.reduce((mask,[,r]) => mask | (r<0x15?1:r<0x1a?2:r<0x1f||r>=0x30?4:r<0x24?8:0),0);
    const flush = () => { const part = { label: `${def.label}Part${parts.length}`, data: bytes }; parts.push(part); bytes = []; };
    const emit = row => { if (bytes.length + row.length > 16000) flush(); bytes.push(...row); };
    const wait = target => { while (frame < target) { const d = Math.min(65535, target-frame); emit([0xfd,d&255,d>>8]); frame += d; } };
    let loopPart = null;
    for (const e of def.data.events) {
      if (def.data.loop !== undefined && !loopPart && e[0] >= def.data.loop) {
        wait(def.data.loop); flush(); loopPart = `${def.label}Part${parts.length}`;
      }
      wait(e[0]); emit([e[1],e[2]]);
    }
    if (def.data.loop !== undefined && !loopPart) { wait(def.data.loop); flush(); loopPart = `${def.label}Part${parts.length}`; }
    wait(def.data.frames); flush();
    parts.forEach((part,i) => {
      const next = parts[i+1]?.label || loopPart;
      const tail = next ? `    db $FF\n    dw ${next}, BANK(${next})` : '    db $FE';
      objects.push({ label: part.label, kind: 'apu', bytes: part.data.length+(next?5:1), body: `${part.label}:\n${part.data.length?'    db '+part.data.join(',')+'\n':''}${tail}` });
    });
    def.first = parts[0].label;
  }
  graphics.worldObjects = [...(graphics.worldObjects || []), ...objects];
  return { calls, definitions, used, enabled };
}
function emit(node, context, helpers, apu) {
  if (!names.includes(node.name)) return null;
  const { fail } = helpers;
  if (node.name === 'audio_file') return ['    ld hl, 0'];
  const sync = ['    call SyncFrameAudio'];
  if (node.name === 'play_audio') {
    if (helpers.typeOf(node.args[0], context.scope) !== 'audio') fail(node, 'play_audio requires an audio_file binding without a shadowing local');
    const d = apu.calls.get(node), slot = node.args[1]?.value ?? 0, priority = node.args[2]?.value ?? 3;
    if (node.args.length < 1 || node.args.length > 3 || ![0,1].includes(slot) || node.args.slice(1).some(n=>n.type!=='number') || !Number.isInteger(priority) || priority < 0 || priority > 7) fail(node, 'play_audio expects audio_file, literal slot 0 (music) or 1 (effect), and priority 0..7');
    return [...sync, '    di', `    ld a, ${d.mask}`, '    ld [wAPURequestedMask], a', `    ld hl, ${d.first}`, `    ld bc, BANK(${d.first})`, `    ld a, ${priority}`, `    ld de, wAPUSlots + ${slot*8}`, '    call APUStart', '    ei', '    ld hl, 0'];
  }
  const slot = node.args[0]?.value ?? 0;
  if (node.args.length > 1 || (node.args.length && node.args[0].type !== 'number') || ![0,1].includes(slot)) fail(node, 'stop_audio expects literal slot 0 or 1');
  return [...sync, '    di', `    ld hl, wAPUSlots + ${slot*8}`, '    call APUStop', '    ei', '    ld hl, 0'];
}
module.exports = { names, procedures, collect, emit };
