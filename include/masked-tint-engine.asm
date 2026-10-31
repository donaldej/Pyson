; Optional CGB-only color accents for the already composed four-shade image.
; The zero color remains in the background. OBJ colors 1..3 replace only owned
; nonzero pixels. Full ownership masks prevent rear colors leaking through a
; front actor's zero-colored outline. Hardware exhaustion loses color accents,
; never body pixels. This section runs on its own bank-2 scratch/stack.
MaskedTintEngine:
IF MASKED_FILL_ENABLED
    call MaskedFillTiles
ENDC
    ld a, [wTintEnabled]
    and a
    jp z, MaskedTintEmpty
    ld a, [wMaskedCount]
    and a
    jp z, MaskedTintEmpty
IF MASKED_TINT_CACHE_ENABLED
    call TintCacheFrame
ENDC
    xor a
    ld [wTintCount], a
    ld hl, wTintScan
    ld b, 9
.scanClear:
    ld [hli], a
    dec b
    jr nz, .scanClear
    ld hl, wShadowOAM
    ld b, 160
.oamClear:
    ld [hli], a
    dec b
    jr nz, .oamClear
    ld a, [wMaskedFront]
    and a
    ld a, 80
    jr z, .baseReady
    xor a
.baseReady:
    ld [wTintBase], a
    ld a, 3
    ld [wTintLayerIndex], a
.layer:
IF MASKED_TINT_CACHE_ENABLED
    push af
    xor a
    ld [wTintCacheMode], a
    pop af
ENDC
    ; Disabled/transparent layers need no scan. In particular, two idle
    ; projectile slots must not double the fighter-color composition work.
    add a
    ld l, a
    ld h, 0
    ld de, MaskedTintActorPointers
    add hl, de
    ld a, [hli]
    ld e, a
    ld d, [hl]
    ld a, [de]
    and a
    jp z, .nextLayer
    ld a, [wTintLayerIndex]
    ld e, a
    ld d, 0
    ld hl, wTintPalettes
    add hl, de
    ld a, [hl]
    cp $FF
    jp z, .nextLayer
    ld [wTintPalette], a
    ld a, [wTintLayerIndex]
    add a
    add a
    add $B0
    ld [wTintOwnerBase], a
IF MASKED_TINT_CACHE_ENABLED
    call TintCacheLookup
    jp c, .nextLayer
ENDC
    call MaskedTintBounds
    jp c, .nextLayer
.band:
    ld a, [wTintBand]
    ld e, a
    ld d, 0
    ld hl, wTintScan
    add hl, de
    ld a, [hl]
    cp 10
    jp nc, .nextBand
    ld a, [wTintBand]
    ld l, a
    ld h, 0
    REPT 6
        add hl, hl
    ENDR
    ld de, wBGTiles
    add hl, de
    ld a, l
    ld [wTintMap], a
    ld a, h
    ld [wTintMap + 1], a
    ld a, [wTintFirstColumn]
    ld [wTintColumn], a
    ld e, a
    ld d, 0
    add hl, de
    ld a, l
    ld [wTintMap], a
    ld a, h
    ld [wTintMap + 1], a
.column:
    ld a, [wTintCount]
    cp 40
    jp nc, .cacheUpload
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld de, $D000
    add hl, de
    ld a, l
    ld [wTintStage], a
    ld a, h
    ld [wTintStage + 1], a
    xor a
    ld [wTintAny], a
    ld a, [wTintMap]
    ld l, a
    ld a, [wTintMap + 1]
    ld h, a
    push hl
    call MaskedTintCell
    pop hl
    ld de, 32
    add hl, de
    call MaskedTintCell
    ld a, [wTintAny]
    and a
    jr z, .nextColumn
    ld a, [wTintCount]
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    ld de, wShadowOAM
    add hl, de
    ld a, [wTintBand]
    swap a
    add 16
    ld [hli], a
    ld a, [wTintColumn]
    add a
    add a
    add a
    add 8
IF SCENE_ENABLED
    ld b, a
    ld a, [wSceneFineNext]
    ld c, a
    ld a, b
    sub c
ENDC
    ld [hli], a
    ld a, [wTintBase]
    ld b, a
    ld a, [wTintCount]
    add a
    add b
    ld [hli], a
    ld a, [wTintPalette]
    or 8
    ld [hl], a
    ld hl, wTintCount
    inc [hl]
    ld a, [wTintBand]
    ld e, a
    ld d, 0
    ld hl, wTintScan
    add hl, de
    inc [hl]
    ld a, [hl]
    cp 10
    jr nc, .nextBand
.nextColumn:
    ld hl, wTintMap
    inc [hl]
    jr nz, .mapAdvanced
    inc hl
    inc [hl]
.mapAdvanced:
    ld a, [wTintColumn]
    inc a
    ld [wTintColumn], a
    ld b, a
    ld a, [wTintLastColumn]
    cp b
    ld a, b
    jr z, .nextBand
    jp .column
.nextBand:
    ld a, [wTintBand]
    inc a
    ld [wTintBand], a
    ld b, a
    ld a, [wTintLastBand]
    cp b
    jp nz, .band
.nextLayer:
IF MASKED_TINT_CACHE_ENABLED
    call TintCacheFinish
ENDC
    ld a, [wTintLayerIndex]
    dec a
    ld [wTintLayerIndex], a
    cp $FF
    jp nz, .layer
    jr .upload
.cacheUpload:
IF MASKED_TINT_CACHE_ENABLED
    call TintCacheFinish
ENDC
.upload:
    ld a, 1
    ld [wOAMDirty], a
IF MASKED_TINT_CACHE_ENABLED
    jp TintCacheUpload
ENDC
    ld a, [wTintCount]
    and a
    ret z
    add a
    dec a
    or $80
    ld c, a
    ld a, 1
    ldh [$FF4F], a
    ld a, $D0
    ldh [$FF51], a
    xor a
    ldh [$FF52], a
    ldh [$FF54], a
    ld a, [wTintBase]
    and a
    ld a, 0
    jr z, .destination
    ld a, 5
.destination:
    ldh [$FF53], a
    ld a, c
    ldh [$FF55], a
.dmaWait:
    call TintSyncAudio
    ldh a, [$FF55]
    bit 7, a
    jr z, .dmaWait
    xor a
    ldh [$FF4F], a
    ret

; HL points to a composed map cell. Append its owned color pattern to the
; candidate's staging bytes. A stationary tile has no actor-owned pixels.
MaskedTintCell:
IF MASKED_FILL_ENABLED
    ; Whole opaque cells are already colored by the background palette.
    ; Do not spend an OBJ component on those pixels a second time.
    push hl
    ld de, wBGAttrs - wBGTiles
    add hl, de
    ld a, [hl]
    cp 4
    pop hl
    jr c, .needsOverlay
    ld a, 128
    jr .classify
.needsOverlay:
ENDC
    ld a, [hl]
.classify:
    cp 128
    jr c, .dynamic
    ld a, [wTintStage]
    ld l, a
    ld a, [wTintStage + 1]
    ld h, a
    xor a
    REPT 16
        ld [hli], a
    ENDR
    jp .stored
.dynamic:
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    ld b, h
    ld c, l
    ld a, [wTintOwnerBase]
    add b
    ld b, a
    add hl, hl
    ld de, $A000
    add hl, de
    ld a, [wTintStage]
    ld e, a
    ld a, [wTintStage + 1]
    ld d, a
    REPT 8
        ld a, [bc]
        inc bc
        push bc
        ld c, a
        ld a, [hli]
        and c
        ld [de], a
        inc de
        ld b, a
        ld a, [hli]
        and c
        ld [de], a
        inc de
        or b
        ld b, a
        ld a, [wTintAny]
        or b
        ld [wTintAny], a
        pop bc
    ENDR
    ld h, d
    ld l, e
.stored:
    ld a, l
    ld [wTintStage], a
    ld a, h
    ld [wTintStage + 1], a
    ret
MaskedTintEmpty:
    ld a, [wTintCount]
    and a
    ret z
    xor a
    ld [wTintCount], a
    ld hl, wShadowOAM
    ld b, 160
.clear:
    ld [hli], a
    dec b
    jr nz, .clear
    ld a, 1
    ld [wOAMDirty], a
    ret

MaskedTintSetPalette:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    cp 4
    ret nc
    ld e, a
    ld d, 0
    ld hl, wTintPalettes
    add hl, de
    ld a, [wArg1 + 1]
    and a
    jr z, .positive
    cp $FF
    ret nz
    ld a, [wArg1]
    cp $FF
    ret nz
    jr .valid
.positive:
    ld a, [wArg1]
    cp 8
    ret nc
.valid:
IF MASKED_FILL_ENABLED
    push af
    push hl
    ld hl, wMaskedFill
    add hl, de
    ld a, [wArg2]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    jr z, .fillReady
    ld a, 1
.fillReady:
    cp [hl]
    jr z, .fillUnchanged
    ld [hl], a
    ld a, 1
    ld [wMaskedDirty], a
    ld [wPaletteDirty], a
IF MASKED_TINT_CACHE_ENABLED
    xor a
    ld hl, wTintCacheValid
    ld b, 12
.invalidateFill:
    ld [hli], a
    dec b
    jr nz, .invalidateFill
ENDC
    call SyncMaskedPalettes
.fillUnchanged:
    pop hl
    pop af
ENDC
    cp [hl]
    ret z
    ld [hl], a
    ld a, 1
    ld [wMaskedDirty], a
IF MASKED_FILL_ENABLED
    ld [wPaletteDirty], a
    call SyncMaskedPalettes
ENDC
    ret

MaskedTintClearOwners:
    ld hl, wTintPalettes
    ld b, 4
.check:
    ld a, [hli]
    cp 8
    jr c, .enabled
    dec b
    jr nz, .check
    ret
.enabled:
    ld a, 1
    ld [wTintEnabled], a
    ret

MaskedTintActorPointers:
    dw wMaskedActors, wMaskedActors + 14, wMaskedActors + 28, wMaskedActors + 42

; Scan only bands/columns touched by this actor's clipped, vertically trimmed
; frame. Negative screen coordinates clamp to zero; right/bottom clamp to the
; hidden map width and physical screen. No source-visible coordinates change.
MaskedTintBounds:
    ld a, [wTintLayerIndex]
    add a
    ld l, a
    ld h, 0
    ld de, MaskedTintActorPointers
    add hl, de
    ld a, [hli]
    ld h, [hl]
    ld l, a
    ld de, 5
    add hl, de
    ld b, [hl]
    inc hl
    inc hl
    ld a, [hli]
    ld e, a
    ld d, [hl]
    push hl
    ld c, 3
IF SCENE_ENABLED
    ld h, 21
ELSE
    ld h, 20
ENDC
    call MaskedTintRange
    ld [wTintFirstColumn], a
    ld a, b
    ld [wTintLastColumn], a
    pop hl
    dec hl
    dec hl
    ld b, [hl]
    inc hl
    inc hl
    inc hl
    ld a, [hli]
    ld e, a
    ld d, [hl]
    ld c, 4
    ld h, 9
    call MaskedTintRange
    ld [wTintBand], a
    cp b
    ccf
    ret c
    ld a, b
    ld [wTintLastBand], a
    ld a, [wTintFirstColumn]
    ld b, a
    ld a, [wTintLastColumn]
    cp b
    jr c, .empty
    jr z, .empty
    ret
.empty:
    scf
    ret

; DE signed pixel position, B extent, C shift, H upper cell bound.
; Return A clamped first cell and B exclusive final cell.
MaskedTintRange:
    push bc
    ld a, d
    bit 7, a
    jr nz, .startZero
    and a
    jr nz, .startLimit
    ld a, e
.startShift:
    srl a
    dec c
    jr nz, .startShift
    cp h
    jr c, .startReady
.startLimit:
    ld a, h
    jr .startReady
.startZero:
    xor a
.startReady:
    ld l, a
    pop bc
    ld a, e
    add b
    ld e, a
    ld a, d
    adc 0
    ld d, a
    bit 7, a
    jr nz, .endZero
    and a
    jr nz, .endLimit
    ; ceil(end / cell size), computed without an eight-bit carry loss.
    ld a, e
    and a
    jr z, .endZero
    dec a
.endShift:
    srl a
    dec c
    jr nz, .endShift
    inc a
    cp h
    jr c, .endReady
.endLimit:
    ld a, h
    jr .endReady
.endZero:
    xor a
.endReady:
    ld b, a
    ld a, l
    ret
IF MASKED_TINT_CACHE_ENABLED
; TINT_CACHE_BODY
ENDC
IF MASKED_FILL_ENABLED
; Private WRAM bank3 stores the stationary attribute shadow. IE is masked
; only during the bank/stack handoff. A bank3 private stack keeps raster/audio
; interrupts safe throughout the long attribute copy. IME is left unchanged.
MaskedAttributeDispatch:
    push hl
    cp 3
    jp z, .mirror
IF IMAGE_MULTIPALETTE
    cp 4
    jr c, .attributes
    cp 5
    ld hl, wBGPalettes
    ld de, $D240
    jr nz, .paletteCount
    ld hl, $D240
    ld de, wBGPalettes
.paletteCount:
    ld bc, 64
    jr .switch
.attributes:
ENDC
    cp 2
    jr z, .single
    cp 1
    ld hl, wBGAttrs
    ld de, $D000
    jr nz, .copyStart
    ld hl, $D000
    ld de, wBGAttrs
.copyStart:
    ld bc, 576
.switch:
    MASKED_ATTRIBUTE_BANK
.copy:
    ld a, [hli]
    ld [de], a
    inc de
    dec bc
    ld a, b
    or c
    jr nz, .copy
    jr .restore
.single:
    ld a, [wTextPalette]
    ld c, a
    ld de, $D000 - wBGAttrs
    add hl, de
    MASKED_ATTRIBUTE_BANK
    ld [hl], c
.restore:
    xor a
    ldh [$FFFF], a
    ld a, [wMaskedAttrSP]
    ld c, a
    ld a, [wMaskedAttrSP + 1]
    ld b, a
    ld a, [wMaskedAttrBank]
    ldh [$FF70], a
    ld h, b
    ld l, c
    ld sp, hl
    ld a, [wMaskedAttrIE]
    ldh [$FFFF], a
    pop hl
    ret
.mirror:
IF SCREEN_IMAGE_ENABLED
    ld a, [wImageActive]
    and a
    jr nz, .mirrorDone
ENDC
    ; RGB changes must reach solid tiles even when the pose is stationary.
    ; Unroll this small copy to keep the normal-speed CGB VBlank budget safe.
    ld hl, wOBJPalettes
    ld de, wBGPalettes + 32
    REPT 32
        ld a, [hli]
        ld [de], a
        inc de
    ENDR
.mirrorDone:
    pop hl
    ret
; Inspect final ownership, after front layers have removed rear ownership.
; Only completely opaque single-owner cells use a fighter BG palette. Mixed
; boundary cells retain the exact scenery and use the normal OBJ overlay.
MaskedFillTiles:
    ld hl, wBGTiles
    ld de, wBGAttrs
    ld bc, 576
.cell:
    ld a, [hl]
    cp 128
    jr nc, .next
    push hl
    push de
    push bc
    ld l, a
    ld h, 0
    REPT 3
        add hl, hl
    ENDR
    ld a, h
    add $B0
    ld h, a
    ld c, 0
.layer:
    push hl
    ld b, 8
.row:
    ld a, [hli]
    cp 255
    jr nz, .notFull
    dec b
    jr nz, .row
    jr .select
.select:
    ld hl, wMaskedFill
    ld b, 0
    add hl, bc
    ld a, [hl]
    and a
    jr z, .notFull
    ld hl, wTintPalettes
    add hl, bc
    ld a, [hl]
    cp 4
    jr nc, .notFull
    add 4
    ld [de], a
    pop hl
    jr .done
.notFull:
    pop hl
    ld a, h
    add 4
    ld h, a
    inc c
    ld a, c
    cp 4
    jr c, .layer
.done:
    pop bc
    pop de
    pop hl
.next:
    inc hl
    inc de
    dec bc
    ld a, b
    or c
    jr nz, .cell
    ret
ENDC
    ASSERT @ - MaskedTintEngine <= (4096 * (1 + MASKED_FILL_ENABLED))
    ds (4096 * (1 + MASKED_FILL_ENABLED)) - (@ - MaskedTintEngine), 0
