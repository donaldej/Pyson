; Handle: slot pointer (2 bytes), generation (4 bytes). Slot: active (1 byte),
; generation (4 bytes), user words. Generations never wrap: exhausted slots retire.
; HL handle -> HL live slot header or zero. All generation bytes must match.
PoolHandleValid:
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    or e
    jr z, .invalid
    push de
    ld a, [de]
    and a
    jr z, .invalid_pop
    inc de
    ld b, 4
.compare:
    ld a, [de]
    cp [hl]
    jr nz, .invalid_pop
    inc de
    inc hl
    dec b
    jr nz, .compare
    pop hl
    ret
.invalid_pop:
    pop hl
.invalid:
    ld hl, 0
    ret

PoolResolve:
    call PoolHandleValid
    ld a, h
    or l
    jp z, PoolHandleError
    ld de, 5
    add hl, de
    ret

PoolDespawn:
    call PoolHandleValid
    ld a, h
    or l
    ret z
    ld [hl], 0
    ld hl, 1
    ret

; HL live slot, DE destination handle. Capture its identity by value.
PoolCapture:
    ld a, l
    ld [de], a
    inc de
    ld a, h
    ld [de], a
    inc de
    inc hl
    ld bc, 4
    jp CopyArray

; HL first slot, DE capacity, BC stride. Preserve generations on reset.
PoolReset:
.next:
    ld [hl], 0
    add hl, bc
    dec de
    ld a, d
    or e
    jr nz, .next
    ld hl, 0
    ret

PoolCount:
    xor a
    ld [wPoolActiveCount], a
.next:
    ld a, [hl]
    and a
    jr z, .inactive
    ld a, [wPoolActiveCount]
    inc a
    ld [wPoolActiveCount], a
.inactive:
    add hl, bc
    dec de
    ld a, d
    or e
    jr nz, .next
    ld a, [wPoolActiveCount]
    ld l, a
    ld h, 0
    ret

; HL ROM descriptor, DE destination handle. Defaults copy afresh on every spawn.
; Return HL destination handle, including a zero handle on exhaustion.
PoolSpawn:
    ld a, e
    ld [wPoolResult], a
    ld a, d
    ld [wPoolResult + 1], a
    ld b, 6
    xor a
.clear:
    ld [de], a
    inc de
    dec b
    jr nz, .clear
    ld a, [hli]
    ld [wPoolSlot], a
    ld a, [hli]
    ld [wPoolSlot + 1], a
    ld a, [hli]
    ld [wPoolRemaining], a
    ld a, [hli]
    ld [wPoolRemaining + 1], a
    ld a, [hli]
    ld [wPoolStride], a
    ld a, [hli]
    ld [wPoolStride + 1], a
    ld a, [hli]
    ld [wPoolDefaults], a
    ld a, [hli]
    ld [wPoolDefaults + 1], a
    ld a, [hli]
    ld [wPoolFieldBytes], a
    ld a, [hl]
    ld [wPoolFieldBytes + 1], a
.search:
    ld a, [wPoolSlot]
    ld l, a
    ld a, [wPoolSlot + 1]
    ld h, a
    ld a, [hl]
    and a
    jr nz, .next
    inc hl
    ld a, [hli]
    and [hl]
    inc hl
    and [hl]
    inc hl
    and [hl]
    cp $ff
    jr z, .next ; All ones: permanently retired, never wrap into an old identity.
    ld a, [wPoolSlot]
    ld l, a
    ld a, [wPoolSlot + 1]
    ld h, a
    inc hl
    inc [hl]
    jr nz, .ready
    inc hl
    inc [hl]
    jr nz, .ready
    inc hl
    inc [hl]
    jr nz, .ready
    inc hl
    inc [hl]
.ready:
    ld a, [wPoolSlot]
    ld l, a
    ld a, [wPoolSlot + 1]
    ld h, a
    ld [hl], 1
    ld a, [wPoolResult]
    ld e, a
    ld a, [wPoolResult + 1]
    ld d, a
    call PoolCapture
    ld a, [wPoolSlot]
    ld l, a
    ld a, [wPoolSlot + 1]
    ld h, a
    ld de, 5
    add hl, de
    ld d, h
    ld e, l
    ld a, [wPoolDefaults]
    ld l, a
    ld a, [wPoolDefaults + 1]
    ld h, a
    ld a, [wPoolFieldBytes]
    ld c, a
    ld a, [wPoolFieldBytes + 1]
    ld b, a
    call CopyArray
    jr .returned
.next:
    ld a, [wPoolSlot]
    ld l, a
    ld a, [wPoolSlot + 1]
    ld h, a
    ld a, [wPoolStride]
    ld c, a
    ld a, [wPoolStride + 1]
    ld b, a
    add hl, bc
    ld a, l
    ld [wPoolSlot], a
    ld a, h
    ld [wPoolSlot + 1], a
    ld a, [wPoolRemaining]
    ld l, a
    ld a, [wPoolRemaining + 1]
    ld h, a
    dec hl
    ld a, l
    ld [wPoolRemaining], a
    ld a, h
    ld [wPoolRemaining + 1], a
    or l
    jp nz, .search
.returned:
    ld a, [wPoolResult]
    ld l, a
    ld a, [wPoolResult + 1]
    ld h, a
    ret
