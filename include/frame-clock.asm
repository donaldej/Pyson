IF FRAME_CLOCK_ENABLED
; Optional audio preserves the actual mapped ROM bank; compiler scratch is untouched.
FrameClockInterrupt:
    push af
IF SCENE_ENABLED
    xor a
    ldh [$FF43], a
ENDC
    ld a, [wFrameCount]
    inc a
    ld [wFrameCount], a
    jr nz, .done
    ld a, [wFrameCount + 1]
    inc a
    and $7F
    ld [wFrameCount + 1], a
.done:
IF APU_STREAM_ENABLED
    ; Streams keep hardware-frame rhythm even during slow game calculations.
    ; Preserve the actual mapping, which may be a graphics/data bank rather
    ; than the compiled caller's execution bank.
    push bc
    push de
    push hl
    ld a, [wSelectedROMBank]
    ld c, a
    ld a, [wSelectedROMBank + 1]
    ld b, a
    push bc
    call APUTick
    pop bc
    call SelectROMBank
    pop hl
    pop de
    pop bc
ENDC
IF BUFFERED_BUTTONS_ENABLED
    push bc
    push hl
    call SampleBufferedButtons
IF INPUT_FRAMES_ENABLED
    call QueueInputFrame
ENDC
    pop hl
    pop bc
ENDC
    pop af
    reti
InitFrameClock:
    xor a
    ldh [$FF0F], a
    ld a, 1
    ldh [$FFFF], a
    ei
    ret
ReadFrameCount:
    di
    ld a, [wFrameCount]
    ld l, a
    ld a, [wFrameCount + 1]
    ld h, a
    ei
    ret
; HL previous -> HL elapsed modulo 32768. Negative inputs return zero.
ElapsedFrames:
    bit 7, h
    jr nz, .invalid
    ld d, h
    ld e, l
    call ReadFrameCount
    ld a, l
    sub e
    ld l, a
    ld a, h
    sbc d
    and $7F
    ld h, a
    ret
.invalid:
    ld hl, 0
    ret
; Wait at least HL further display frames. Zero/negative returns immediately.
WaitFrames:
    bit 7, h
    ret nz
    ld a, h
    or l
    ret z
    ld b, h
    ld c, l
    call ReadFrameCount
    ld d, h
    ld e, l
.wait:
    push bc
    push de
    call WaitVBlank
    pop hl
    pop bc
    push bc
    push hl
    call ElapsedFrames
    pop de
    pop bc
    ld a, l
    sub c
    ld a, h
    sbc b
    jr c, .wait
    jp SyncFrameAudio
; Snapshot first: servicing cannot create an unbounded catch-up loop.
SyncFrameAudio:
IF SOUND_ENABLED
    push af
    push bc
    push de
    push hl
    call ReadFrameCount
    ld a, [wFrameAudioCursor]
    ld e, a
    ld a, [wFrameAudioCursor + 1]
    ld d, a
    ld a, l
    ld [wFrameAudioCursor], a
    sub e
    ld c, a
    ld a, h
    ld [wFrameAudioCursor + 1], a
    sbc d
    and $7F
    ld b, a
.tick:
    ld a, b
    or c
    jr z, .done
    push bc
    call SoundTick
IF MUSIC_ENABLED
    call MusicTick
IF WAVE_MUSIC_ENABLED
    call WaveMusicTick
ENDC
ENDC
    pop bc
    dec bc
    jr .tick
.done:
    pop hl
    pop de
    pop bc
    pop af
ENDC
    ret
ENDC
