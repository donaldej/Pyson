; Four opaque colors and an independent mask. Four retained, ordered layers.
; Shared patterns live at $8800; dynamic patterns alternate $8000/$9000.
; No LCD stop, visible-pattern writes, OAM entries, or framebuffer allocation.
ResetMasked:
    xor a
    ld [wMaskedCacheReady], a
IF MASKED_TINT_CACHE_ENABLED
    ld [wTintTagReady], a
    ld hl, wTintCacheValid
    ld b, 12
.cacheClear:
    ld [hli], a
    dec b
    jr nz, .cacheClear
ENDC
IF MASKED_TINT_ENABLED
    ld hl, wTintPalettes
    ld b, 4
    ld a, $FF
.tints:
    ld [hli], a
    dec b
    jr nz, .tints
ENDC
    ld hl, wMaskedActors
    ld b, 56
    xor a
.clear:
    ld [hli], a
    dec b
    jr nz, .clear
    ld hl, wMaskedBase
    ld bc, 576
.base:
    ld a, 128
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .base
    ld a, 1
    ld [wMaskedDirty], a
    ret

MaskedSlot:
    ld a, [wArg0 + 1]
    and a
    scf
    ret nz
    ld a, [wArg0]
    cp 4
    jr nc, .invalid
    ld hl, wMaskedActors
    and a
    ret z
    ld de, 14
.slot:
    add hl, de
    dec a
    jr nz, .slot
    and a
    ret
.invalid:
    scf
    ret

HideMasked:
    call MaskedSlot
    ret c
    ld a, [hl]
    and a
    ret z
    ld [hl], 0
    ld a, 1
    ld [wMaskedDirty], a
    ret

DrawMasked:
    ; clip_top is a screen-space row, inclusive. Invalid clips retain the layer.
    ld a, [wArg6 + 1]
    and a
    ret nz
    ld a, [wArg6]
    cp 145
    ret nc
    call MaskedSlot
    ret c
IF SCENE_ENABLED
    ; Public masked coordinates stay screen pixels even with fine scrolling.
    ; The hidden map uses the containing tile; hardware removes this phase.
    ld a, [wSceneActive]
    and a
    jr z, .sceneCoordinatesReady
    ld hl, wArg3
    ld a, [wSceneFineNext]
    add [hl]
    ld [hli], a
    ld a, [hl]
    adc 0
    ld [hl], a
    ld a, [wArg6]
    cp SCENE_HUD_ROWS * 8
    jr nc, .sceneCoordinatesReady
    ld a, SCENE_HUD_ROWS * 8
    ld [wArg6], a
.sceneCoordinatesReady:
    ; MaskedSlot's pointer is needed below, after the coordinate scratch work.
    call MaskedSlot
ENDC
    ld a, l
    ld [wMaskedState], a
    ld a, h
    ld [wMaskedState + 1], a
    ld a, [wArg1 + 1]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret nz
    ld a, [wArg1]
    call FindAsset
    ret c
    ld a, [hli]
    cp 11
    ret nz
    push hl
    inc hl
    inc hl
    ld a, [wArg2]
    cp [hl]
    pop hl
    ret nc
    call ReadDescriptor
    ld a, [wArg2]
    ld l, a
    ld h, 0
    REPT 6
        add hl, hl
    ENDR
    ld a, [wArg5]
    ld b, a
    ld a, [wArg5 + 1]
    or b
    jr z, .unflipped
    ld de, 32
    add hl, de
.unflipped:
    ld a, [wArg3]
    and 7
    add a
    add a
    ld e, a
    ld d, 0
    add hl, de
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld de, wMaskedNew + 1
    ld b, 4
.pointer:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .pointer
    ld a, 1
    ld [wMaskedNew], a
    ld a, [wAssetCols]
    add a
    add a
    add a
    ld [de], a
    inc de
    ld a, [wAssetRows]
    ld [de], a
    inc de
    ld hl, wArg3
    ld b, 4
.xy:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .xy
    ld a, [wArg6]
    ld [de], a
    ; Each prepared variant starts with its transparent top margin and its
    ; trimmed height. Skip blank outer rows instead of interpreting them on
    ; every animation update. Public coordinates still refer to the full BMP.
    ld a, [wMaskedNew + 3]
    ld c, a
    ld a, [wMaskedNew + 4]
    ld b, a
    call SelectROMBank
    ld a, [wMaskedNew + 1]
    ld l, a
    ld a, [wMaskedNew + 2]
    ld h, a
    ld a, [hli]
    ld b, a
    ld a, [hli]
    ld [wMaskedNew + 6], a
    and a
    jr nz, .trimmedVisible
    ld [wMaskedNew], a
.trimmedVisible:
    ld a, l
    ld [wMaskedNew + 1], a
    ld a, h
    ld [wMaskedNew + 2], a
    ld hl, wMaskedNew + 9
    ld a, b
    add [hl]
    ld [hli], a
    ld a, [hl]
    adc 0
    ld [hl], a
    ld a, [wMaskedState]
    ld e, a
    ld a, [wMaskedState + 1]
    ld d, a
    ld hl, wMaskedNew
    ld b, 12
.compare:
    ld a, [de]
    cp [hl]
    jr z, .same
    ld a, 1
    ld [wMaskedDirty], a
.same:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .compare
    ret

ComposeMasked:
IF SCREEN_IMAGE_ENABLED
    ld a, [wImageActive]
    and a
    ret nz
ENDC
    ld a, [wMaskedDirty]
    and a
    ret z
    xor a
    ld [wMaskedDirty], a
    ld [wMaskedOverflow], a
    ld [wMaskedCount], a
    ld [$4000], a
    ld a, $0A
    ld [$0000], a
    call CacheMaskedPatterns
    ld hl, wMaskedBase
    ld de, wBGTiles
    ld bc, 576
    call CopyArray
IF MASKED_FILL_ENABLED
MACRO MASKED_ATTRIBUTE_BANK
    ldh a, [$FFFF]
    ld [wMaskedAttrIE], a
    xor a
    ldh [$FFFF], a
    ld [wMaskedAttrSP], sp
    ldh a, [$FF70]
    ld [wMaskedAttrBank], a
    ld a, 3
    ldh [$FF70], a
    ld sp, $DFF0
    ld a, [wMaskedAttrIE]
    ldh [$FFFF], a
ENDM
    call RestoreMaskedAttributes
ENDC
IF MASKED_TINT_ENABLED
    call ClearMaskedOwners
    xor a
    ld [wTintLayer], a
ENDC
    ld hl, wMaskedActors
    call MaskedStream
IF MASKED_TINT_ENABLED
    ld a, 1
    ld [wTintLayer], a
ENDC
    ld hl, wMaskedActors + 14
    call MaskedStream
IF MASKED_TINT_ENABLED
    ld a, 2
    ld [wTintLayer], a
ENDC
    ld hl, wMaskedActors + 28
    call MaskedStream
IF MASKED_TINT_ENABLED
    ld a, 3
    ld [wTintLayer], a
ENDC
    ld hl, wMaskedActors + 42
    call MaskedStream
    ld a, [wMaskedOverflow]
    and a
    jp nz, .overflow
    ld hl, $A000
    ld de, $9000
    ld a, [wMaskedFront]
    and a
    jr z, .target
    ld de, $8000
.target:
    ld a, [wMaskedCount]
    and a
    jr z, .uploaded
IF COLOR_ENABLED
    ld c, a
    ld a, [wIsCGB]
    and a
    ld a, c
    jr z, .cpuUpload
    ; CGB HBlank DMA copies only the hidden pool while the LCD stays running.
    dec a
    or $80
    ld c, a
    ld a, $A0
    ldh [$FF51], a
    xor a
    ldh [$FF52], a
    ldh [$FF54], a
    ld a, d
    and $1F
    ldh [$FF53], a
    ld a, c
    ldh [$FF55], a
.dmaWait:
    call SyncFrameAudio
    ldh a, [$FF55]
    bit 7, a
    jr z, .dmaWait
    jr .uploaded
.cpuUpload:
ENDC
    ld [wMaskedRowsLeft], a
.tile:
    ld b, 16
.upload:
    ld c, [hl]
.access:
    di
    ldh a, [$FF41]
    and 2
    jr nz, .access
    ld a, c
.writePattern:
    ld [de], a
    inc hl
    inc de
    ; Two bytes fit even if the sampled HBlank ends immediately: the
    ; following 80-cycle OAM-search interval still permits VRAM writes.
    ld a, [hli]
.writePatternSecond:
    ld [de], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    inc de
    dec b
    dec b
    jr nz, .upload
    call SyncFrameAudio
    ld a, [wMaskedRowsLeft]
    dec a
    ld [wMaskedRowsLeft], a
    jr nz, .tile
.uploaded:
IF MASKED_TINT_ENABLED
    call ComposeMaskedTint
ENDC
    xor a
    ld [$0000], a
    ld hl, wDirtyRows
    ld b, 18
.dirty:
    ld a, [hl]
IF MASKED_FILL_ENABLED
    or 15
ELSE
    or 3
ENDC
    ld [hl], a
    inc hl
    dec b
    jr nz, .dirty
    ld a, 1
    ld [wMaskedPending], a
    ret
.overflow:
    xor a
    ld [$0000], a
    ld a, 1
    ld [wMaskedDirty], a
    ld hl, wDirtyRows
    ld b, 18
    xor a
.clean:
    ld [hli], a
    dec b
    jr nz, .clean
    ret

; Cache stationary patterns separately from the composed A000-A7FF pool. It is
; rebuilt after scene changes; no source bank switch is needed for each cell.
CacheMaskedPatterns:
    ld a, [wMaskedCacheReady]
    and a
    ret nz
    ld bc, BANK(Font)
    call SelectROMBank
    ld hl, Font
    ld de, $A800
    ld bc, FontEnd - Font
    call CopyArray
IF SCENE_ENABLED
    ld a, [wSceneActive]
    and a
    jr z, .ready
    ld a, [wScenePatterns]
    ld e, a
    ld a, [wScenePatterns + 1]
    ld d, a
    ld a, [wSceneMap]
    sub e
    ld c, a
    ld a, [wSceneMap + 1]
    sbc d
    ld b, a
    push bc
    push de
    ld a, [wSceneBank]
    ld c, a
    ld a, [wSceneBank + 1]
    ld b, a
    call SelectROMBank
    pop hl
    pop bc
    ld de, $A800 + SCENE_TILE_BASE * 16
    call CopyArray
.ready:
ENDC
    ld a, 1
    ld [wMaskedCacheReady], a
    ret

; Each source row is consumed once. A000-AFFF is volatile graphics RAM.
; The compiler rejects battery-backed/save-enabled configurations in this mode.
MaskedStream:
    ld a, [hli]
    and a
    ret z
    ld a, [hli]
    ld [wMaskedFramePointer], a
    ld a, [hli]
    ld [wMaskedFramePointer + 1], a
    ld a, [hli]
    ld [wMaskedFrameBank], a
    ld a, [hli]
    ld [wMaskedFrameBank + 1], a
    inc hl ; retained source width; rows already encode their sparse columns
    ld a, [hli]
    ld [wMaskedHeight], a
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    and a
    jr z, .positiveX
    cp $FF
    ret nz
    ld a, e
    cp $80
    ret c
    jr .validX
.positiveX:
    ld a, e
IF SCENE_ENABLED
    cp 168
ELSE
    cp 160
ENDC
    ret nc
.validX:
    REPT 3
        sra d
        rr e
    ENDR
    ld a, e
    ld [wMaskedX], a
    ld a, [hli]
    ld [wMaskedY], a
    ld e, a
    ld a, [hli]
    ld [wMaskedY + 1], a
    ld b, a
    ld a, [hl]
    ld [wMaskedClipTop], a
    ld a, b
    and a
    jr z, .positiveY
    cp $FF
    ret nz
    ld a, e
    cp $80
    ret c
    jr .validY
.positiveY:
    ld a, e
    cp 144
    ret nc
.validY:
    ld a, [wMaskedFrameBank]
    ld c, a
    ld a, [wMaskedFrameBank + 1]
    ld b, a
    call SelectROMBank
.row:
    ld a, [wMaskedFramePointer]
    ld l, a
    ld a, [wMaskedFramePointer + 1]
    ld h, a
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, l
    ld [wMaskedFramePointer], a
    ld a, h
    ld [wMaskedFramePointer + 1], a
    ld h, d
    ld l, e
    ld a, [hli]
    cp 255
    jp z, .nextRow
    ld b, a
    ld a, [wMaskedX]
    add b
    ld [wMaskedColumn], a
    ld a, [hli]
    ld [wMaskedChunk], a
    inc hl
    ld a, l
    ld [wMaskedSource], a
    ld a, h
    ld [wMaskedSource + 1], a
    ld a, [wMaskedY + 1]
    and a
    jp nz, .nextRow
    ld a, [wMaskedClipTop]
    ld b, a
    ld a, [wMaskedY]
    cp b
    jp c, .nextRow
    cp 144
    jp nc, .nextRow
    ld b, a
    and 7
    add a
    ld [wMaskedLine], a
    ld a, b
    and $F8
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    ld a, l
    ld [wMaskedIndex], a
    ld a, h
    ld [wMaskedIndex + 1], a
    ld a, [wMaskedSource]
    ld l, a
    ld a, [wMaskedSource + 1]
    ld h, a
.chunk:
    ld a, [hli]
    ld [wMaskedLeft], a
    ld a, [hli]
    ld [wMaskedLeft + 1], a
    ld a, [hli]
    ld [wMaskedLeft + 2], a
    push hl
    ld a, [wMaskedLeft]
    and a
    jr z, .nextChunk
    ld a, [wMaskedColumn]
IF SCENE_ENABLED
    cp 21
ELSE
    cp 20
ENDC
    jr nc, .nextChunk
    call MaskedMergeCell
.nextChunk:
    pop hl
    ld a, [wMaskedColumn]
    inc a
    ld [wMaskedColumn], a
    ld a, [wMaskedChunk]
    dec a
    ld [wMaskedChunk], a
    jp nz, .chunk
.nextRow:
    ld hl, wMaskedY
    inc [hl]
    jr nz, .yIncremented
    inc hl
    inc [hl]
.yIncremented:
    ld a, [wMaskedHeight]
    dec a
    ld [wMaskedHeight], a
    jp nz, .row
    ret

MaskedMergeCell:
    ld a, [wMaskedIndex]
    ld l, a
    ld a, [wMaskedIndex + 1]
    ld h, a
    ld a, [wMaskedColumn]
    ld e, a
    ld d, 0
    add hl, de
    ld de, wBGTiles
    add hl, de
    ld a, [hl]
    cp 128
    jr c, .existing
    push af
    ld a, [wMaskedCount]
    cp 128
    jr nc, .full
    ld [hl], a
    inc a
    ld [wMaskedCount], a
    dec a
    ld l, a
    ld h, 0
    REPT 4
        add hl, hl
    ENDR
    ld de, $A000
    add hl, de
    ld d, h
    ld e, l
    ld a, l
    ld [wMaskedDest], a
    ld a, h
    ld [wMaskedDest + 1], a
    pop af
    sub 128
    ld l, a
    ld h, 0
    REPT 4
        add hl, hl
    ENDR
    ld bc, $A800
    add hl, bc
    REPT 16
        ld a, [hli]
        ld [de], a
        inc de
    ENDR
    ld a, [wMaskedDest]
    ld l, a
    ld a, [wMaskedDest + 1]
    ld h, a
IF MASKED_TINT_ENABLED
    call InitMaskedOwner
ENDC
    jr .merge
.full:
    pop af
    ld a, 1
    ld [wMaskedOverflow], a
    ret
.existing:
    ld l, a
    ld h, 0
    REPT 4
        add hl, hl
    ENDR
    ld de, $A000
    add hl, de
.merge:
    ld a, [wMaskedLine]
    ld e, a
    ld d, 0
    add hl, de
IF MASKED_TINT_ENABLED
    call MergeMaskedOwner
ENDC
    ld a, [wMaskedLeft]
    cpl
    ld c, a
    and [hl]
    ld b, a
    ld a, [wMaskedLeft + 1]
    or b
    ld [hli], a
    ld a, c
    and [hl]
    ld b, a
    ld a, [wMaskedLeft + 2]
    or b
    ld [hl], a
    ret

IF MASKED_TINT_ENABLED
InitMaskedOwner:
    ld a, [wTintEnabled]
    and a
    ret z
    push hl
    push bc
    ld a, h
    sub $A0
    ld h, a
    srl h
    rr l
    ld a, h
    add $B0
    ld h, a
    ld b, 4
    xor a
.plane:
    push hl
    REPT 8
        ld [hli], a
    ENDR
    pop hl
    ld a, h
    add 4
    ld h, a
    xor a
    dec b
    jr nz, .plane
    pop bc
    pop hl
    ret

; Optional CGB color overlays. The four ownership planes use the otherwise
; unused B000-BFFF half of volatile cartridge RAM, never persistent saves.
SetMaskedPalette:
    ld a, [wIsCGB]
    and a
    ret z
    ld bc, BANK(MaskedTintEngine)
    call SelectROMBank
    jp MaskedTintSetPalette

ClearMaskedOwners:
    xor a
    ld [wTintEnabled], a
    ld a, [wIsCGB]
    and a
    ret z
    ld bc, BANK(MaskedTintEngine)
    call SelectROMBank
    jp MaskedTintClearOwners

MergeMaskedOwner:
    ld a, [wTintEnabled]
    and a
    ret z
    push hl
    push bc
    ld a, h
    sub $A0
    ld d, a
    ld e, l
    srl d
    rr e
    ld a, d
    add $B0
    ld d, a
    ld a, [wMaskedLeft]
    cpl
    ld c, a
    REPT 4
        ld a, [de]
        and c
        ld [de], a
        inc d
        inc d
        inc d
        inc d
    ENDR
    ld a, [wTintLayer]
    add a
    add a
    sub 16
    add d
    ld d, a
    ld a, [wMaskedLeft]
    ld c, a
    ld a, [de]
    or c
    ld [de], a
    pop bc
    pop hl
    ret

ComposeMaskedTint:
    ld a, [wIsCGB]
    and a
    ret z
    ; User variables and their stack stay in bank 1. The color engine owns
    ; bank 2's staging bytes and a separate temporary stack. Restore both
    ; atomically so ordinary source calls never observe a different bank.
    di
    ld [wTintSavedSP], sp
    ld a, 2
    ldh [$FF70], a
    ld sp, $DFF0
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ld bc, BANK(MaskedTintEngine)
    call SelectROMBank
    call MaskedTintEngine
    di
    ld a, 1
    ldh [$FF70], a
    ld a, [wTintSavedSP]
    ld l, a
    ld a, [wTintSavedSP + 1]
    ld h, a
    ld sp, hl
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

TintSyncAudio:
    ; Audio can visit another ROM bank. The extension itself runs in ROMX.
    call SyncFrameAudio
    ld bc, BANK(MaskedTintEngine)
    jp SelectROMBank
ENDC

IF MASKED_FILL_ENABLED
SaveMaskedAttributes:
    xor a
    jr MaskedAttributeCall
RestoreMaskedAttributes:
    ld a, 1
    jr MaskedAttributeCall
SyncMaskedPalettes:
    ld a, 3
    jr MaskedAttributeCall
IF IMAGE_MULTIPALETTE
SaveMaskedImagePalette:
    ld a, 4
    jr MaskedAttributeCall
RestoreMaskedImagePalette:
    ld a, 5
    jr MaskedAttributeCall
ENDC
SaveMaskedAttribute:
    ld a, 2
MaskedAttributeCall:
    push bc
    push de
    ld d, a
    ld a, [wIsCGB]
    and a
    jr nz, .color
IF IMAGE_MULTIPALETTE
    ; Only commands4/5 copy the eight-byte DMG palette. Attribute and RGB
    ; mirror commands are CGB-only and must never enter CopyImageData.
    bit 2, d
    jr z, .done
    pop de
    pop bc
    jp CopyImageData
ELSE
    jr .done
ENDC
.color:
    ld a, [wSelectedROMBank]
    ld c, a
    ld a, [wSelectedROMBank + 1]
    ld b, a
    push bc
    ld a, d
    ld bc, BANK(MaskedTintEngine)
    call SelectROMBank
    call MaskedAttributeDispatch
    pop bc
    call SelectROMBank
.done:
    pop de
    pop bc
    ret
ENDC
