; Nonblocking one-voice pulse (CH2) / noise (CH4) effect sequencer.
; Effect header: kind, priority, duty, step count.
; Each step: frame ticks, envelope volume, frequency low, frequency high.
InitSound:
    xor a
    ldh [$FF26], a
    ld a, $80
    ldh [$FF26], a
    ld a, 7
    ld [wSoundLeft], a
    ld [wSoundRight], a
    ld a, $77
    ldh [$FF24], a
IF MUSIC_ENABLED
IF WAVE_MUSIC_ENABLED
    ld a, $FF
ELSE
    ld a, $BB
ENDC
ELSE
    ld a, $AA
ENDC
    ldh [$FF25], a
    ret

StopSound:
    xor a
    ldh [$FF17], a
    ldh [$FF21], a
    ld [wSoundActive], a
    ld [wSoundFrames], a
    ld [wSoundSteps], a
    ld [wSoundPriority], a
    ret

; HL effect pointer, A priority 0..7. Lower priority is ignored while busy.
PlaySound:
    ld b, a
    ld a, [wSoundMuted]
    and a
    ret nz
    ld a, [wSoundActive]
    and a
    jr z, .accept
    ld a, [wSoundPriority]
    ld c, a
    ld a, b
    cp c
    ret c
.accept:
    push hl
    push bc
    call StopSound
    pop bc
    pop hl
    ld a, b
    ld [wSoundPriority], a
    ld a, [hli]
    ld [wSoundKind], a
    inc hl ; default priority, already resolved by compiler
    ld a, [hli]
    ld [wSoundDuty], a
    ld a, [hli]
    ld [wSoundSteps], a
    ld a, l
    ld [wSoundPointer], a
    ld a, h
    ld [wSoundPointer + 1], a
    ld a, 1
    ld [wSoundActive], a
    jp SoundNextStep

SoundTick:
    ld a, [wSoundActive]
    and a
    ret z
    ld hl, wSoundFrames
    dec [hl]
    ret nz
SoundNextStep:
    ld a, [wSoundSteps]
    and a
    jp z, StopSound
    dec a
    ld [wSoundSteps], a
    ld a, [wSoundPointer]
    ld l, a
    ld a, [wSoundPointer + 1]
    ld h, a
    ld a, [hli]
    ld [wSoundFrames], a
    ld b, [hl]
    inc hl
    ld c, [hl]
    inc hl
    ld d, [hl]
    inc hl
    ld a, l
    ld [wSoundPointer], a
    ld a, h
    ld [wSoundPointer + 1], a
    ld a, [wSoundKind]
    and a
    jr nz, .noise
    xor a
    ldh [$FF21], a
    ld a, [wSoundDuty]
    ldh [$FF16], a
    ld a, b
    ldh [$FF17], a
    ld a, c
    ldh [$FF18], a
    ld a, d
    or $80
    ldh [$FF19], a
    ret
.noise:
    xor a
    ldh [$FF17], a
    ldh [$FF20], a
    ld a, b
    ldh [$FF21], a
    ld a, c
    ldh [$FF22], a
    ld a, $80
    ldh [$FF23], a
    ret

SetSoundVolume:
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ret nz
    ld a, [wArg0]
    cp 8
    ret nc
    ld b, a
    ld a, [wArg1]
    cp 8
    ret nc
    ld [wSoundRight], a
    ld a, b
    ld [wSoundLeft], a
    swap a
    ld b, a
    ld a, [wSoundRight]
    or b
    ldh [$FF24], a
    ret
MuteSound:
    ld a, [wArg0]
    ld b, a
    ld a, [wArg0 + 1]
    or b
    jr z, .unmute
    ld a, 1
    ld [wSoundMuted], a
    call StopSound
IF MUSIC_ENABLED
    call StopMusic
IF WAVE_MUSIC_ENABLED
    call StopWaveMusic
ENDC
ENDC
    xor a
    ldh [$FF25], a
    ret
.unmute:
    xor a
    ld [wSoundMuted], a
IF MUSIC_ENABLED
IF WAVE_MUSIC_ENABLED
    ld a, $FF
ELSE
    ld a, $BB
ENDC
ELSE
    ld a, $AA
ENDC
    ldh [$FF25], a
    ret
