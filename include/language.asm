InitState:
    ld hl, wStateStart
    ld bc, wStateEnd - wStateStart
.clear:
    xor a
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .clear
    call InitGraphics
IF MUTABLE_ENABLED
    call InitMutableMaps
ENDC
IF RANDOM_ENABLED
    call RandomInit
ENDC
IF SAVE_ENABLED
    call InitSave
ENDC
IF SOUND_ENABLED
    call InitSound
ENDC
    call PollButtons
    ret

; Wait for a fresh VBlank. Preserves BC, DE and HL.
WaitVBlank:
IF FRAME_CLOCK_ENABLED
    call SyncFrameAudio
ELSE
IF SOUND_ENABLED
    ; Service audio before waiting, keeping fresh-VBlank graphics time available.
    push bc
    push de
    push hl
    call SoundTick
IF MUSIC_ENABLED
    call MusicTick
IF WAVE_MUSIC_ENABLED
    call WaveMusicTick
ENDC
ENDC
    pop hl
    pop de
    pop bc
ENDC
ENDC
.leave:
    ld a, [$FF44]
    cp 144
    jr nc, .leave
.enter:
    ld a, [$FF44]
    cp 144
    jr c, .enter
.return:
    ret

; Bits: right,left,up,down,A,B,select,start (low to high).
PollButtons:
    ld a, [wButtonsHeld]
    ld c, a
    ld a, $20
    ld [$FF00], a
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    cpl
    and $0F
    ld l, a
    ld a, $10
    ld [$FF00], a
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    ld a, [$FF00]
    cpl
    and $0F
    swap a
    or l
    ld b, a
    ld a, c
    cpl
    and b
    ld [wButtonsPressed], a
    ld a, b
    ld [wButtonsHeld], a
    ld a, $30
    ld [$FF00], a
    ret

NegHL:
    ld a, l
    cpl
    ld l, a
    ld a, h
    cpl
    ld h, a
    inc hl
    ret

; Compare signed DE (left) with HL (right): carry=less, zero=equal.
CompareSigned:
    ld a, h
    xor $80
    ld b, a
    ld a, d
    xor $80
    cp b
    ret nz
    ld a, e
    cp l
    ret

; DE * HL -> HL, modulo 65536.
Mul16:
    ld b, d
    ld c, e
    ld d, h
    ld e, l
    ld hl, 0
    ld a, 16
.loop:
    bit 0, e
    jr z, .skip
    add hl, bc
.skip:
    sla c
    rl b
    srl d
    rr e
    dec a
    jr nz, .loop
    ret

; Unsigned HL / BC -> DE quotient, HL remainder.
; Used with absolute signed operands or decimal divisor 10.
UnsignedDiv:
    ld d, h
    ld e, l
    ld hl, 0
    ld a, 16
.loop:
    sla e
    rl d
    rl l
    rl h
    push af
    ld a, l
    sub c
    ld l, a
    ld a, h
    sbc b
    ld h, a
    jr nc, .subtract
    add hl, bc
    jr .next
.subtract:
    inc e
.next:
    pop af
    dec a
    jr nz, .loop
    ret

; Signed DE // HL -> HL; Python-sign remainder stored in wRemainder.
Div16:
    ld a, h
    or l
    jp z, DivisionByZero
    ld a, h
    and $80
    ld [wDivisorNegative], a
    xor d
    and $80
    ld [wQuotientNegative], a
    bit 7, h
    call nz, NegHL
    ld a, l
    ld [wDivisor], a
    ld a, h
    ld [wDivisor + 1], a
    ld h, d
    ld l, e
    bit 7, h
    call nz, NegHL
    ld a, [wDivisor]
    ld c, a
    ld a, [wDivisor + 1]
    ld b, a
    call UnsignedDiv
    ld a, [wQuotientNegative]
    and a
    jr z, .remainderSign
    ld a, h
    or l
    jr z, .negateQuotient
    inc de
    ; Floor division rounds down; remainder is divisor - absolute remainder.
    ld a, c
    sub l
    ld l, a
    ld a, b
    sbc h
    ld h, a
.negateQuotient:
    push hl
    ld h, d
    ld l, e
    call NegHL
    ld d, h
    ld e, l
    pop hl
.remainderSign:
    ld a, [wDivisorNegative]
    and a
    call nz, NegHL
    ld a, l
    ld [wRemainder], a
    ld a, h
    ld [wRemainder + 1], a
    ld h, d
    ld l, e
    ret

; HL integer, BC coordinates. Convert to text then use the string printer.
PrintNumber:
    push bc
    call IntToText
    pop bc
    jp PrintAt

IntToText:
    ld a, h
    and $80
    ld [wNumberNegative], a
    bit 7, h
    call nz, NegHL
    push hl
    ld hl, wNumberBuffer + 6
    ld [hl], 255
    ld a, l
    ld [wNumberPointer], a
    ld a, h
    ld [wNumberPointer + 1], a
    pop hl
.digit:
    ld bc, 10
    call UnsignedDiv
    push de
    ld e, l
    ld d, 0
    ld hl, DigitTiles
    add hl, de
    ld a, [hl]
    ld c, a
    ld a, [wNumberPointer]
    ld l, a
    ld a, [wNumberPointer + 1]
    ld h, a
    dec hl
    ld [hl], c
    ld a, l
    ld [wNumberPointer], a
    ld a, h
    ld [wNumberPointer + 1], a
    pop hl
    ld a, h
    or l
    jr nz, .digit
    ld a, [wNumberPointer]
    ld l, a
    ld a, [wNumberPointer + 1]
    ld h, a
    ld a, [wNumberNegative]
    and a
    ret z
    dec hl
    ld [hl], MINUS_TILE
    ret

; HL = zero-free tile string (255 terminator, 254 newline), B=x, C=y.
PrintAt:
    ld a, b
    ld [wPrintX], a
.row:
    ld a, c
    cp 18
    ret nc
    ; Nothing is drawn for empty strings or blank lines.
    ld a, [hl]
    cp 255
    ret z
    cp 254
    jr z, .blank
    ld a, [wPrintX]
    ld b, a
.character:
    ld a, [hli]
    cp 255
    ret z
    cp 254
    jr z, .newline
    call SetCell
    inc b
    ld a, b
    cp 20
    jr c, .character
.clip:
    ld a, [hli]
    cp 255
    ret z
    cp 254
    jr nz, .clip
.newline:
    inc c
    jr .row
.blank:
    inc hl
    jr .newline
