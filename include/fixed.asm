; Signed Q12.4: one unit = 1/16. No floating-point runtime.
FixedFromInt:
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    ret

; Drop the fraction toward zero, including negative values.
FixedToInt:
    bit 7, h
    jr z, .positive
    call NegHL
    call .positive
    jp NegHL
.positive:
    REPT 4
    srl h
    rr l
    ENDR
    ret

; DE left, HL right. Keep magnitudes and result sign in shared scratch.
FixedOperands:
    ld a, d
    xor h
    and $80
    ld [wFixedSign], a
    bit 7, h
    call nz, NegHL
    ld a, l
    ld [wFixedRight], a
    ld a, h
    ld [wFixedRight + 1], a
    ld h, d
    ld l, e
    bit 7, h
    call nz, NegHL
    ld a, l
    ld [wFixedLeft], a
    ld a, h
    ld [wFixedLeft + 1], a
    xor a
    ld [wFixedLeft + 2], a
    ld [wFixedLeft + 3], a
    ret

FixedResultSign:
    ld a, [wFixedSign]
    and a
    ret z
    jp NegHL

; Full unsigned 32-bit product, shift four, then apply sign. Truncate toward zero.
FixedMul:
    call FixedOperands
    ld hl, 0
    ld bc, 0
    ld a, 16
    ld [wFixedCount], a
.loop:
    ld a, [wFixedRight]
    bit 0, a
    jr z, .shift
    ld a, [wFixedLeft]
    ld e, a
    ld a, [wFixedLeft + 1]
    ld d, a
    add hl, de
    ld a, [wFixedLeft + 2]
    adc c
    ld c, a
    ld a, [wFixedLeft + 3]
    adc b
    ld b, a
.shift:
    push hl
    ld hl, wFixedLeft
    sla [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    ld hl, wFixedRight + 1
    srl [hl]
    dec hl
    rr [hl]
    pop hl
    ld a, [wFixedCount]
    dec a
    ld [wFixedCount], a
    jr nz, .loop
    REPT 4
    srl b
    rr c
    rr h
    rr l
    ENDR
    jp FixedResultSign

; Unsigned (left << 4) / right with a 32-bit numerator. Truncate toward zero.
FixedDiv:
    ld a, h
    or l
    jp z, DivisionByZero
    call FixedOperands
    ld hl, wFixedLeft
    REPT 4
    sla [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    dec hl
    dec hl
    dec hl
    ENDR
    ld a, [wFixedRight]
    ld e, a
    ld a, [wFixedRight + 1]
    ld d, a
    ld hl, 0
    ld a, 32
    ld [wFixedCount], a
.loop:
    push hl
    ld hl, wFixedLeft
    sla [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    inc hl
    rl [hl]
    pop hl
    rl l
    rl h
    ld a, h
    cp d
    jr c, .next
    jr nz, .subtract
    ld a, l
    cp e
    jr c, .next
.subtract:
    ld a, l
    sub e
    ld l, a
    ld a, h
    sbc d
    ld h, a
    ld a, [wFixedLeft]
    or 1
    ld [wFixedLeft], a
.next:
    ld a, [wFixedCount]
    dec a
    ld [wFixedCount], a
    jr nz, .loop
    ld a, [wFixedLeft]
    ld l, a
    ld a, [wFixedLeft + 1]
    ld h, a
    jp FixedResultSign
