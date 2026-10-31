; Optional frame-timed APU register streams. All code executes in ROM0;
; banked input is restored before returning to a compiled function.
; Slot layout: pointer(2), bank(2), wait(2), active, priority.
APUStart:
    push af
    push hl
    push bc
    ld h, d
    ld l, e
    ld bc, 6
    add hl, bc
    ld a, [hli]
    and a
    jr z, .accept
    pop bc
    pop de
    pop af
    cp [hl]
    ret c
    push af
    push de
    push bc
.accept:
    pop bc
    pop de
    pop af
    ld [hld], a
    ld a, 1
    ld [hld], a
    xor a
    ld [hld], a
    ld [hld], a
    ld [hl], b
    dec hl
    ld [hl], c
    dec hl
    ld [hl], d
    dec hl
    ld [hl], e
    ld a, l
    cp LOW(wAPUSlots + 8)
    ld a, 0
    jr nz, .music
    inc a
    ld [wAPUIsEffect], a
    ld a, [wAPURequestedMask]
    ld [wAPUEffectMask], a
    ld a, [wAPUSlots + 6]
    and a
    jr nz, .effectReady
    ld a, $77
    ldh [$FF24], a
    ld a, $FF
    ldh [$FF25], a
.effectReady:
    jp APUAdvance
.music:
    ld [wAPUIsEffect], a
    jp APUAdvance

APUStop:
    ld a, l
    ld [wAPUState], a
    ld a, h
    ld [wAPUState + 1], a
    ld de, 6
    add hl, de
    xor a
    ld [hl], a
    ld a, [wAPUState]
    cp LOW(wAPUSlots + 8)
    jr z, .effect
    ; Stopping background leaves a currently active effect alone.
    ld a, [wAPUSlots + 14]
    and a
    jr nz, .keepEffect
    xor a
    ldh [$FF12], a
    ldh [$FF17], a
    ldh [$FF1A], a
    ldh [$FF21], a
    ret
.keepEffect:
    ld a, [wAPUEffectMask]
    ld b, a
    bit 0, b
    jr nz, .keepPulse1
    xor a
    ldh [$FF12], a
.keepPulse1:
    bit 1, b
    jr nz, .keepPulse2
    xor a
    ldh [$FF17], a
.keepPulse2:
    bit 2, b
    jr nz, .keepWave
    xor a
    ldh [$FF1A], a
.keepWave:
    bit 3, b
    ret nz
    xor a
    ldh [$FF21], a
    ret
.effect:
    xor a
    ld [wAPUEffectMask], a
    ; Restore the current background register state, not its old position.
    ; Envelopes restart here; this is stream mixing, not a native driver VM.
    ld a, [wAPUSlots + 6]
    and a
    jr z, .silence
    xor a
    ldh [$FF1A], a
    ld hl, wAPUShadow + $20
    ld c, $30
.wave:
    ld a, [hli]
    ldh [c], a
    inc c
    ld a, c
    cp $40
    jr nz, .wave
    ld hl, wAPUShadow
    ld c, $10
.restore:
    ld a, [hli]
    ldh [c], a
    inc c
    ld a, c
    cp $24
    jr nz, .restore
    ret
.silence:
    xor a
    ldh [$FF12], a
    ldh [$FF17], a
    ldh [$FF1A], a
    ldh [$FF21], a
    ret

APUTick:
    xor a
    ld [wAPUIsEffect], a
    ld hl, wAPUSlots
    call APUAdvance
    ld a, 1
    ld [wAPUIsEffect], a
    ld hl, wAPUSlots + 8
    jp APUAdvance

APUAdvance:
    ld a, l
    ld [wAPUState], a
    ld a, h
    ld [wAPUState + 1], a
    push hl
    ld de, 6
    add hl, de
    ld a, [hl]
    pop hl
    and a
    ret z
    push hl
    ld de, 4
    add hl, de
    ld a, [hli]
    ld c, a
    ld b, [hl]
    ld a, b
    or c
    jr z, .due
    dec bc
    ld [hl], b
    dec hl
    ld [hl], c
    ld a, b
    or c
    jr z, .due
    pop hl
    ret
.due:
    pop hl
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, [hli]
    ld c, a
    ld b, [hl]
    call SelectROMBank
.read:
    ld a, [de]
    inc de
    cp $FF
    jr z, .link
    cp $FE
    jr z, .end
    cp $FD
    jr z, .wait
    ld c, a
    ld a, [de]
    inc de
    push de
    call APUWrite
    pop de
    jr .read
.link:
    ld a, [de]
    inc de
    ld l, a
    ld a, [de]
    inc de
    ld h, a
    ld a, [de]
    inc de
    ld c, a
    ld a, [de]
    ld b, a
    ld d, h
    ld e, l
    ld a, [wAPUState]
    ld l, a
    ld a, [wAPUState + 1]
    ld h, a
    inc hl
    inc hl
    ld [hl], c
    inc hl
    ld [hl], b
    call SelectROMBank
    jr .read
.wait:
    ld a, [de]
    inc de
    ld c, a
    ld a, [de]
    inc de
    ld b, a
    ld a, [wAPUState]
    ld l, a
    ld a, [wAPUState + 1]
    ld h, a
    ld [hl], e
    inc hl
    ld [hl], d
    inc hl
    inc hl
    inc hl
    ld [hl], c
    inc hl
    ld [hl], b
    jr .restoreBank
.end:
    ld a, [wAPUState]
    ld l, a
    ld a, [wAPUState + 1]
    ld h, a
    call APUStop
.restoreBank:
IF CODE_BANKING_ENABLED
    jp RestoreExecutionBank
ELSE
    ld bc, BANK(Font)
    jp SelectROMBank
ENDC

; C register offset, A value. Background channels owned by the effect are
; shadowed but suppressed until the effect ends. Effect global writes are
; ignored so they cannot power down or reroute unrelated music channels.
APUWrite:
    ld b, a
    ld a, [wAPUIsEffect]
    and a
    jr nz, .effect
    ld a, c
    sub $10
    ld e, a
    ld d, 0
    ld hl, wAPUShadow
    add hl, de
    ld [hl], b
    ld a, [wAPUSlots + 14]
    and a
    jr z, .write
    call .channel
    ld e, a
    ld a, [wAPUEffectMask]
    and e
    ret nz
    jr .write
.effect:
    ld a, c
    cp $24
    jr c, .write
    cp $30
    ret c
.write:
    ld a, b
    ldh [c], a
    ret
.channel:
    ld a, c
    cp $15
    ld a, 1
    ret c
    ld a, c
    cp $1A
    ld a, 2
    ret c
    ld a, c
    cp $1F
    ld a, 4
    ret c
    ld a, c
    cp $24
    ld a, 8
    ret c
    ld a, c
    cp $30
    ld a, 4
    ret nc
    xor a
    ret
