; Full-period 16-bit LCG, with byte-swapped output. Shared game RNG state.
RandomInit:
    ld hl, 1
    jr RandomStoreSeed
RandomSeed:
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
RandomStoreSeed:
    ld a, l
    ld [wRandomState], a
    ld a, h
    ld [wRandomState + 1], a
    ret
RandomNext:
    ld a, [wRandomState]
    ld l, a
    ld a, [wRandomState + 1]
    ld h, a
    ld de, 25173
    call Mul16
    ld de, 13849
    add hl, de
    call RandomStoreSeed
    ld a, h
    ld h, l
    ld l, a
    ret

; Unsigned HL modulo DE -> HL. Handles the extra remainder carry for
; divisors above 32768, unlike a signed division shortcut.
RandomModulo:
    ld bc, 0
    ld a, 16
.loop:
    push af
    add hl, hl
    rl c
    rl b
    jr c, .subtract
    ld a, c
    sub e
    ld a, b
    sbc d
    jr c, .next
.subtract:
    ld a, c
    sub e
    ld c, a
    ld a, b
    sbc d
    ld b, a
.next:
    pop af
    dec a
    jr nz, .loop
    ld h, b
    ld l, c
    ret

RandomRange:
    ld c, 0
    jr RandomBounds
RandomInt:
    ld c, 1
RandomBounds:
    push bc
    ld a, [wArg0]
    ld e, a
    ld a, [wArg0 + 1]
    ld d, a
    ld a, [wArg1]
    ld l, a
    ld a, [wArg1 + 1]
    ld h, a
    call CompareSigned
    pop bc
    jr c, .valid
    jr nz, .invalid
    ld a, c
    and a
    jr z, .invalid
.valid:
    ld a, e
    ld [wRandomMinimum], a
    ld a, d
    ld [wRandomMinimum + 1], a
    ld a, l
    sub e
    ld l, a
    ld a, h
    sbc d
    ld h, a
    ld a, c
    and a
    jr z, .span
    inc hl
.span:
    ld a, l
    ld [wRandomSpan], a
    ld a, h
    ld [wRandomSpan + 1], a
    or l
    jr z, .full
    ld d, h
    ld e, l
    call NegHL
    call RandomModulo
    ld a, l
    ld [wRandomThreshold], a
    ld a, h
    ld [wRandomThreshold + 1], a
.sample:
    call RandomNext
    ld a, [wRandomThreshold]
    ld e, a
    ld a, [wRandomThreshold + 1]
    ld d, a
    ld a, l
    sub e
    ld a, h
    sbc d
    jr c, .sample
    ld a, [wRandomSpan]
    ld e, a
    ld a, [wRandomSpan + 1]
    ld d, a
    call RandomModulo
    jr .offset
.full:
    call RandomNext
.offset:
    ld a, [wRandomMinimum]
    ld e, a
    ld a, [wRandomMinimum + 1]
    ld d, a
    add hl, de
    ret
.invalid:
    ld hl, 0
    ret
