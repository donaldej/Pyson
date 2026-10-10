; CH1 melody. Header: loop, duty, count. Notes: ticks, envelope, period lo/hi.
; MusicPointer always points at the current note; pause preserves its timer.
StopMusic:
    xor a
    ldh [$FF12], a
    ld [wMusicActive], a
    ld [wMusicPaused], a
    ret

; HL track, A restart truth value. Repeated selection preserves playback.
PlayMusic:
    ld b, a
    ld a, [wSoundMuted]
    and a
    ret nz
    ld a, [wMusicActive]
    and a
    jr z, .start
    ld a, b
    and a
    jr nz, .start
    ld a, [wMusicDefinition]
    cp l
    jr nz, .start
    ld a, [wMusicDefinition + 1]
    cp h
    ret z
.start:
    ld a, l
    ld [wMusicDefinition], a
    ld a, h
    ld [wMusicDefinition + 1], a
    xor a
    ld [wMusicPaused], a
    ld a, 1
    ld [wMusicActive], a
MusicReset:
    ld a, [wMusicDefinition]
    ld l, a
    ld a, [wMusicDefinition + 1]
    ld h, a
    inc hl
    inc hl
    ld a, [hli]
    ld [wMusicSteps], a
MusicLoad:
    ld a, l
    ld [wMusicPointer], a
    ld a, h
    ld [wMusicPointer + 1], a
    ld a, [hl]
    ld [wMusicFrames], a
    jp MusicRender

MusicTick:
    ld a, [wMusicActive]
    and a
    ret z
    ld a, [wMusicPaused]
    and a
    ret nz
    ld hl, wMusicFrames
    dec [hl]
    ret nz
    ld hl, wMusicSteps
    dec [hl]
    jr nz, .next
    ld a, [wMusicDefinition]
    ld l, a
    ld a, [wMusicDefinition + 1]
    ld h, a
    ld a, [hl]
    and a
    jp nz, MusicReset
    jp StopMusic
.next:
    ld a, [wMusicPointer]
    ld l, a
    ld a, [wMusicPointer + 1]
    ld h, a
    ld de, 4
    add hl, de
    jp MusicLoad

MusicRender:
    ; Disable DAC before changing envelope; sweep disabled for predictable notes.
    xor a
    ldh [$FF12], a
    ldh [$FF10], a
    ld a, [wMusicDefinition]
    ld l, a
    ld a, [wMusicDefinition + 1]
    ld h, a
    inc hl
    ld a, [hl]
    ldh [$FF11], a
    ld a, [wMusicPointer]
    ld l, a
    ld a, [wMusicPointer + 1]
    ld h, a
    inc hl
    ld a, [hli]
    ldh [$FF12], a
    ld a, [hli]
    ldh [$FF13], a
    ld a, [hl]
    or $80
    ldh [$FF14], a
    ret

PauseMusic:
    ld a, [wMusicActive]
    and a
    ret z
    ld a, 1
    ld [wMusicPaused], a
    xor a
    ldh [$FF12], a
    ret
ResumeMusic:
    ld a, [wMusicActive]
    and a
    ret z
    ld a, [wMusicPaused]
    and a
    ret z
    xor a
    ld [wMusicPaused], a
    jp MusicRender
MusicPlaying:
    ld hl, 0
    ld a, [wMusicActive]
    and a
    ret z
    ld a, [wMusicPaused]
    and a
    ret nz
    inc l
    ret
