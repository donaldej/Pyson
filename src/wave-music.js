'use strict';
const fs = require('node:fs');
const path = require('node:path');
function runtime(root) {
  // Both voices use the same sequence/control semantics. Keep that code shared
  // and substitute only the channel's render routine and hardware register.
  let code = fs.readFileSync(path.join(root, 'include/music.asm'), 'utf8').replace(/wMusic/g, 'wWaveMusic').replace(/\bMusic/g, 'WaveMusic').replace(/\b(Stop|Play|Pause|Resume)Music/g, '$1WaveMusic').replace(/\$FF12/g, '$FF1A');
  const start = code.indexOf('WaveMusicRender:'); const end = code.indexOf('PauseWaveMusic:');
  const render = `WaveMusicRender:
    ; Disable the wave DAC before accessing Wave RAM, including on DMG.
    xor a
    ldh [$FF1A], a
    ld a, [wWaveMusicDefinition]
    ld e, a
    ld a, [wWaveMusicDefinition + 1]
    ld d, a
    ld h, d
    ld l, e
    inc hl
    inc hl
    ld a, [hl]
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, de
    inc hl
    inc hl
    inc hl
    ld de, $FF30
    ld b, 16
.wave:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .wave
    ld a, $80
    ldh [$FF1A], a
    xor a
    ldh [$FF1B], a
    ld a, [wWaveMusicPointer]
    ld l, a
    ld a, [wWaveMusicPointer + 1]
    ld h, a
    inc hl
    ld a, [hli]
    ldh [$FF1C], a
    ld a, [hli]
    ldh [$FF1D], a
    ld a, [hl]
    or $80
    ldh [$FF1E], a
    ret

`;
  return code.slice(0, start) + render + code.slice(end);
}
module.exports = { runtime };
