; 40 six-byte playback states: ROM0 definition pointer, step, ticks, frame, flags.
; Flags bit 0=playing, bit 1=finished. Advance only through UpdateAnimations.
FindAnimationState:
    ld a, [wArg0 + 1]
    and a
    jr nz, .invalid
    ld a, [wArg0]
    cp 40
    jr nc, .invalid
    ld h, 0
    ld l, a
    add hl, hl
    ld d, h
    ld e, l
    add hl, hl
    add hl, de
    ld de, wAnimationStates
    add hl, de
    and a
    ret
.invalid:
    scf
    ret

; HL state -> load its current step's frame and duration. Clobbers BC/DE.
AnimationLoadStep:
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, [hl]
    add a
    add 3
    ld c, a
    ld b, 0
    push hl
    ld h, d
    ld l, e
    add hl, bc
    ld b, [hl]
    inc hl
    ld c, [hl]
    pop hl
    inc hl
    ld [hl], c
    inc hl
    ld [hl], b
    ret

PlayAnimation:
    call FindAnimationState
    ret c
    ld a, [wArg1]
    cp [hl]
    jr nz, .start
    inc hl
    ld a, [wArg1 + 1]
    cp [hl]
    dec hl
    jr nz, .start
    ld a, [wArg2]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret z ; same animation: preserve progress, including stop/finished state
.start:
    push hl
    ld a, [wArg1]
    ld [hli], a
    ld a, [wArg1 + 1]
    ld [hli], a
    xor a
    ld [hl], a
    pop hl
    call AnimationLoadStep
    inc hl
    ld [hl], 1
    ld hl, 0
    ret

RestartAnimation:
    call FindAnimationState
    ret c
    ld a, [hli]
    ld [wArg1], a
    ld b, a
    ld a, [hl]
    ld [wArg1 + 1], a
    or b
    ret z
    ld a, 1
    ld [wArg2], a
    xor a
    ld [wArg2 + 1], a
    jp PlayAnimation

StopAnimation:
    call FindAnimationState
    ret c
    ld de, 5
    add hl, de
    ld [hl], 0
    ld hl, 0
    ret

; Preserve the state pointer and the caller's slot counter.
AdvanceAnimation:
    push hl
    push bc
    ld de, 5
    add hl, de
    bit 0, [hl]
    jr z, .done
    dec hl
    dec hl
    dec [hl]
    jr nz, .done
    dec hl
    inc [hl] ; next step
    ld b, [hl]
    dec hl
    dec hl
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    inc de
    ld a, [de] ; number of steps
    cp b
    jr nz, .next
    inc de
    ld a, [de] ; loop flag
    and a
    jr nz, .loop
    inc hl
    inc hl
    inc hl
    ld [hl], 2 ; hold last frame, finished and no longer playing
    jr .done
.loop:
    ld [hl], 0
.next:
    dec hl
    dec hl
    call AnimationLoadStep
.done:
    pop bc
    pop hl
    ret

UpdateAnimations:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    and a
    ret z
.tick:
    push af
    ld hl, wAnimationStates
    ld b, 40
.slot:
    call AdvanceAnimation
    ld de, 6
    add hl, de
    dec b
    jr nz, .slot
    pop af
    dec a
    jr nz, .tick
    ld hl, 0
    ret

AnimationFrame:
    call FindAnimationState
    jr c, .invalid
    ld a, [hli]
    or [hl]
    jr z, .invalid
    inc hl
    inc hl
    inc hl
    ld l, [hl]
    ld h, 0
    ret
.invalid:
    ld hl, -1
    ret

AnimationPlaying:
    call FindAnimationState
    jr c, AnimationFalse
    ld de, 5
    add hl, de
    ld a, [hl]
    and 1
    ld l, a
    ld h, 0
    ret
AnimationFinished:
    call FindAnimationState
    jr c, AnimationFalse
    ld de, 5
    add hl, de
    ld a, [hl]
    and 2
    srl a
    ld l, a
    ld h, 0
    ret
AnimationFalse:
    ld hl, 0
    ret

; Convert animation draw arguments into the existing sprite API arguments.
PrepareAnimatedSprite:
    call FindAnimationState
    ret c
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    or e
    jr z, .invalid
    inc hl
    inc hl
    ld a, [hl]
    push af ; frame
    ld a, [de] ; sprite sheet handle in the definition
    push af
    ld a, [wArg3]
    ld [wArg5], a
    ld a, [wArg3 + 1]
    ld [wArg5 + 1], a
    ld a, [wArg4]
    ld [wArg6], a
    ld a, [wArg4 + 1]
    ld [wArg6 + 1], a
    ld a, [wArg2]
    ld [wArg4], a
    ld a, [wArg2 + 1]
    ld [wArg4 + 1], a
    ld a, [wArg1]
    ld [wArg3], a
    ld a, [wArg1 + 1]
    ld [wArg3 + 1], a
    pop af
    ld [wArg1], a
    pop af
    ld [wArg2], a
    xor a
    ld [wArg1 + 1], a
    ld [wArg2 + 1], a
    ret
.invalid:
    scf
    ret

DrawAnimatedSprite:
    call PrepareAnimatedSprite
    ret c
    jp DrawSprite
DrawWorldAnimatedSprite:
    call PrepareAnimatedSprite
    ret c
    jp DrawWorldSprite
