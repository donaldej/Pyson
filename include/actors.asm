; Sparse streamed actors. Each declaration owns its OAM range and two VRAM
; buffers. A new pose uploads to the buffer not referenced by the visible OAM.
DrawActor:
IF ACTOR_ENABLED
    call FindActorDefinition
    ret c
    ld a, [wArg1 + 1]
    and a
    ret nz
    ld a, [wArg0]
    call FindAsset
    inc hl ; kind was checked by FindActorDefinition
    push hl
    inc hl
    inc hl
    ld a, [wArg1]
    cp [hl]
    pop hl
    ret nc
    call ReadDescriptor
    ld a, [wArg1]
    ld [wActorFrame], a
    ; Resolve the frame record on every draw, even when only position changed.
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, [hli]
    ld c, a
    ld b, [hl]
    ld a, c
    ld [wActorFrameBank], a
    ld a, b
    ld [wActorFrameBank + 1], a
    ld a, e
    ld [wActorFramePointer], a
    ld a, d
    ld [wActorFramePointer + 1], a
    ld a, [wActorStatePointer]
    ld l, a
    ld a, [wActorStatePointer + 1]
    ld h, a
    ld a, [hli]
    and a
    jr z, .newPose
    ld a, [wActorFrame]
    cp [hl]
    jr nz, .newPose
    inc hl
    ld a, [hl]
    ld [wActorFront], a
    xor a
    ld [wActorPattern], a ; zero = no pattern upload
    jr .resolve
.newPose:
    ; Multiple new poses before refresh must commit the preceding OAM first.
    ld a, [wActorPending]
    and a
    call nz, RefreshScreen
    ld a, [wActorStatePointer]
    ld l, a
    ld a, [wActorStatePointer + 1]
    ld h, a
    ld a, 1
    ld [hli], a
    ld a, [wActorFrame]
    ld [hli], a
    ld a, [hl]
    xor 1
    ld [hl], a
    ld [wActorFront], a
    ld a, 1
    ld [wActorPattern], a
.resolve:
    ld a, [wActorDefinition]
    ld l, a
    ld a, [wActorDefinition + 1]
    ld h, a
    ld a, [hli]
    ld b, a
    ld a, [wActorFront]
    and a
    jr z, .baseReady
    ld a, [hl]
    add b
    ld b, a
.baseReady:
    ld a, b
    ld [wActorTileBase], a
    ld a, [wActorFrameBank]
    ld c, a
    ld a, [wActorFrameBank + 1]
    ld b, a
    call SelectROMBank
    ld a, [wActorFramePointer]
    ld l, a
    ld a, [wActorFramePointer + 1]
    ld h, a
    ld a, [hli]
    ld b, a ; number of unique patterns
    ld a, [wActorPattern]
    and a
    jr z, .skipPatterns
    ld a, b
    and a
    jr z, .patternsDone
    ld a, [wActorTileBase]
    ld e, a
    ld d, 0
    REPT 4
        sla e
        rl d
    ENDR
    set 7, d
.tile:
    push bc
    ld b, 16
.byte:
    ld c, [hl]
.accessible:
    di
    ldh a, [$FF41]
    and 2
    jr nz, .accessible
    ld a, c
.writePattern:
    ld [de], a
    ei
    inc de
    inc hl
    dec b
    jr nz, .byte
    call SyncFrameAudio
    pop bc
    dec b
    jr nz, .tile
    ld a, 1
    ld [wActorPending], a
    jr .patternsDone
.skipPatterns:
    ld e, b
    ld d, 0
    REPT 4
        sla e
        rl d
    ENDR
    add hl, de
.patternsDone:
    push hl
    call ClearActorSprites
    pop hl
    ld a, [hli]
    ld [wActorLeft], a
    and a
    ret z
    ld a, [wAssetPalette]
    or $10 ; dedicated DMG fallback palette, ignored by CGB palette selection
    ld [wActorFlags], a
    ld a, [wArg4]
    ld b, a
    ld a, [wArg4 + 1]
    or b
    jr z, .noFlipX
    ld a, [wActorFlags]
    or $20
    ld [wActorFlags], a
.noFlipX:
    ld a, [wArg5]
    ld b, a
    ld a, [wArg5 + 1]
    or b
    jr z, .noFlipY
    ld a, [wActorFlags]
    or $40
    ld [wActorFlags], a
.noFlipY:
.component:
    ld a, [hli]
    ld [wActorXOffset], a
    ld a, [hli]
    ld [wActorYOffset], a
    ld a, [hli]
    ld [wActorPattern], a
    push hl
    ld a, [wActorFlags]
    bit 5, a
    jr z, .xOffsetReady
    ld a, [wActorXOffset]
    ld b, a
    ld a, [wAssetCols]
    add a
    add a
    add a
    sub 8
    sub b
    ld [wActorXOffset], a
.xOffsetReady:
    ld a, [wArg2]
    ld l, a
    ld a, [wArg2 + 1]
    ld h, a
    ld a, [wActorXOffset]
    add 8
    ld e, a
    ld d, 0
    add hl, de
    ld a, h
    and a
    jp nz, .hidden
    ld a, l
    and a
    jp z, .hidden
    cp 168
    jp nc, .hidden
    ld [wActorX], a
    ld a, [wActorFlags]
    bit 6, a
    jr z, .yOffsetReady
    ld a, [wActorYOffset]
    ld b, a
    ld a, [wAssetRows]
    add a
    add a
    add a
    sub ACTOR_COMPONENT_HEIGHT
    sub b
    ld [wActorYOffset], a
.yOffsetReady:
    ld a, [wArg3]
    ld l, a
    ld a, [wArg3 + 1]
    ld h, a
    ld a, [wActorYOffset]
    add 16
    ld e, a
    ld d, 0
    add hl, de
    ld a, h
    and a
    jr nz, .hidden
    ld a, l
    cp 17 - ACTOR_COMPONENT_HEIGHT
    jr c, .hidden
    cp 160
    jr nc, .hidden
    ld [wActorY], a
    ld a, [wActorSlot]
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    ld de, wShadowOAM
    add hl, de
    ld a, [wActorY]
    ld [hli], a
    ld a, [wActorX]
    ld [hli], a
    ld a, [wActorPattern]
    ld b, a
    ld a, [wActorTileBase]
    add b
    ld [hli], a
    ld a, [wActorFlags]
    ld [hl], a
.hidden:
    pop hl
    ld a, [wActorSlot]
    inc a
    ld [wActorSlot], a
    ld a, [wActorLeft]
    dec a
    ld [wActorLeft], a
    jp nz, .component
ENDC
    ret

HideActor:
IF ACTOR_ENABLED
    call FindActorDefinition
    ret c
    jp ClearActorSprites
ENDC
    ret

IF ACTOR_ENABLED
; Validate a handle, and retain the six-byte ROM definition and RAM cache.
FindActorDefinition:
    ld a, [wArg0 + 1]
    and a
    jr nz, .invalid
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hl]
    cp 9
    jr nz, .invalid
    ld a, [wArg0]
    ld l, a
    ld h, 0
    add hl, hl
    ld d, h
    ld e, l
    add hl, hl
    add hl, de
    ld de, ActorDefinitions
    add hl, de
    ld a, l
    ld [wActorDefinition], a
    ld a, h
    ld [wActorDefinition + 1], a
    inc hl
    inc hl
    inc hl
    inc hl
    ld a, [hli]
    ld [wActorStatePointer], a
    ld a, [hl]
    ld [wActorStatePointer + 1], a
    and a
    ret
.invalid:
    scf
    ret

ClearActorSprites:
    ld a, [wActorDefinition]
    ld l, a
    ld a, [wActorDefinition + 1]
    ld h, a
    inc hl
    inc hl
    ld a, [hli]
    ld [wActorSlot], a
    ld e, a
    ld d, 0
    ld b, [hl]
    ld a, b
    and a
    ret z
    ld l, e
    ld h, 0
    add hl, hl
    add hl, hl
    ld de, wShadowOAM
    add hl, de
.clear:
    ld [hl], 0
    REPT 4
        inc hl
    ENDR
    dec b
    jr nz, .clear
    ld a, 1
    ld [wOAMDirty], a
    ret
ENDC
