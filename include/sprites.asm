; A asset ID -> HL descriptor. Carry set if invalid.
FindAsset:
    cp ASSET_COUNT
    jr nc, .invalid
    ld h, 0
    ld l, a
    add hl, hl
    ld d, h
    ld e, l
    add hl, hl
    add hl, hl
    add hl, de ; ten-byte descriptor, including two-byte bank number
    ld de, AssetDescriptors
    add hl, de
    and a
    ret
.invalid:
    scf
    ret

; HL points at descriptor's columns byte; load common dimensions/palette/map.
ReadDescriptor:
    ld a, [hli]
    ld [wAssetCols], a
    ld a, [hli]
    ld [wAssetRows], a
    inc hl ; frame count
    ld a, [hli]
    ld [wAssetPalette], a
    ld a, [hli]
    ld [wAssetCount], a
    ld a, [hli]
    ld [wAssetMap], a
    ld a, [hli]
    ld [wAssetMap + 1], a
    push bc
    ld a, [hli]
    ld c, a
    ld b, [hl]
IF STREAM_ENABLED
    ld a, c
    ld [wAssetBank], a
    ld a, b
    ld [wAssetBank + 1], a
ENDC
    call SelectROMBank
    pop bc
    ret

HideSprite:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    cp 40
    ret nc
    ld e, a
    ld d, 0
    ld hl, wSpriteCounts
    add hl, de
    ld b, [hl]
    ld [hl], 0
    ld a, b
    and a
    jr nz, .countKnown
    inc b
.countKnown:
    ld h, 0
    ld l, e
    add hl, hl
    add hl, hl
    ld de, wShadowOAM
    add hl, de
.hide:
    ld [hl], 0
    inc hl
    inc hl
    inc hl
    inc hl
    dec b
    jr nz, .hide
    ld a, 1
    ld [wOAMDirty], a
    ret

DrawSprite:
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret nz
    ld a, [wArg0]
    cp 40
    ret nc
    ld [wSpriteSlot], a
    ld a, [wArg1]
    call FindAsset
    ret c
    ld a, [hli]
    cp 1
    ret nz
    push hl
    inc hl
    inc hl
    ld a, [wArg2]
    cp [hl]
    pop hl
    ret nc
    call ReadDescriptor
    ld a, [wSpriteSlot]
    ld b, a
    ld a, [wAssetCount]
    add b
    cp 41
    ret nc
    call HideSprite
    ; Advance to the selected frame's tile map.
    ld a, [wArg2]
    ld h, 0
    ld l, a
    ld a, [wAssetCount]
    ld d, 0
    ld e, a
    call Mul16
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld a, l
    ld [wAssetMap], a
    ld a, h
    ld [wAssetMap + 1], a
    ld a, [wSpriteSlot]
    ld e, a
    ld d, 0
    ld hl, wSpriteCounts
    add hl, de
    ld a, [wAssetCount]
    ld [hl], a
    ; Color palette and DMG palette selection share the attribute byte.
    ld a, [wAssetPalette]
    ld b, a
    and 1
    swap a
    or b
    ld [wSpriteFlags], a
    ld a, [wArg5]
    ld b, a
    ld a, [wArg5 + 1]
    or b
    jr z, .noFlipX
    ld a, [wSpriteFlags]
    or $20
    ld [wSpriteFlags], a
.noFlipX:
    ld a, [wArg6]
    ld b, a
    ld a, [wArg6 + 1]
    or b
    jr z, .noFlipY
    ld a, [wSpriteFlags]
    or $40
    ld [wSpriteFlags], a
.noFlipY:
    xor a
    ld [wSpriteRow], a
.row:
    xor a
    ld [wSpriteCol], a
.cell:
    ; Hardware offsets: x + 8, y + 16. Clip whole off-screen component tiles.
    ld a, [wSpriteCol]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    add hl, hl
    ld de, 8
    add hl, de
    ld a, [wArg3]
    ld e, a
    ld a, [wArg3 + 1]
    ld d, a
    add hl, de
    ld a, h
    and a
    jp nz, .hidden
    ld a, l
    and a
    jp z, .hidden
    cp 168
    jp nc, .hidden
    ld [wSpriteX], a
    ld a, [wSpriteRow]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    add hl, hl
    ld de, 16
    add hl, de
    ld a, [wArg4]
    ld e, a
    ld a, [wArg4 + 1]
    ld d, a
    add hl, de
    ld a, h
    and a
    jp nz, .hidden
    ld a, l
    cp 9
    jp c, .hidden
    cp 160
    jp nc, .hidden
    ld [wSpriteY], a
    ; Reverse map row/column as well as the pixels when flipping a metasprite.
    ld a, [wSpriteRow]
    ld b, a
    ld a, [wSpriteFlags]
    bit 6, a
    jr z, .mapRow
    ld a, [wAssetRows]
    dec a
    sub b
    ld b, a
.mapRow:
    ld h, 0
    ld l, b
    ld a, [wAssetCols]
    ld d, 0
    ld e, a
    call Mul16
    ld a, [wSpriteCol]
    ld b, a
    ld a, [wSpriteFlags]
    bit 5, a
    jr z, .mapCol
    ld a, [wAssetCols]
    dec a
    sub b
    ld b, a
.mapCol:
    ld d, 0
    ld e, b
    add hl, de
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld a, [hl]
    ld [wSpriteTile], a
    jr .write
.hidden:
    xor a
    ld [wSpriteY], a
    ld [wSpriteX], a
    ld [wSpriteTile], a
.write:
    ld a, [wSpriteSlot]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    ld de, wShadowOAM
    add hl, de
    ld a, [wSpriteY]
    ld [hli], a
    ld a, [wSpriteX]
    ld [hli], a
    ld a, [wSpriteTile]
    ld [hli], a
    ld a, [wSpriteFlags]
    ld [hl], a
    ld a, [wSpriteSlot]
    inc a
    ld [wSpriteSlot], a
    ld a, [wSpriteCol]
    inc a
    ld [wSpriteCol], a
    ld b, a
    ld a, [wAssetCols]
    cp b
    jp nz, .cell
    ld a, [wSpriteRow]
    inc a
    ld [wSpriteRow], a
    ld b, a
    ld a, [wAssetRows]
    cp b
    jp nz, .row
    ld a, 1
    ld [wOAMDirty], a
    ret

DrawMap:
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret nz
    ld a, [wArg1]
    cp 20
    ret nc
    ld a, [wArg2]
    cp 18
    ret nc
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 2
    jr z, .descriptor
    cp 4
    jr z, .descriptor
    cp 7
    ret nz
.descriptor:
    push af
    call ReadDescriptor
    pop af
    ld [wAssetCount], a
    cp 4
    jr nz, .palette
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld a, [hli]
    ld [wDescriptor], a
    ld a, [hli]
    ld [wDescriptor + 1], a
    ld a, l
    ld [wAssetMap], a
    ld a, h
    ld [wAssetMap + 1], a
.palette:
    ld a, [wAssetPalette]
    ld [wTextPalette], a
    xor a
    ld [wMapRow], a
.row:
    xor a
    ld [wMapCol], a
.cell:
    ld a, [wMapCol]
    ld b, a
    ld a, [wArg1]
    add b
    ld b, a
    ld a, [wMapRow]
    ld c, a
    ld a, [wArg2]
    add c
    ld c, a
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld a, [hli]
    ld d, a
    ld a, [wAssetCount]
    cp 7
    jr nz, .immutableCell
    ld a, [hli]
    and 7
    ld [wTextPalette], a
    inc hl
    jr .advance
.immutableCell:
    cp 4
    jr nz, .advance
    push hl
    ld h, 0
    ld l, d
    add hl, hl
    ld e, d
    ld d, 0
    add hl, de
    ld a, [wDescriptor]
    ld e, a
    ld a, [wDescriptor + 1]
    ld d, a
    add hl, de
    ld a, [hli]
    ld d, a ; graphics tile
    ld a, [hl]
    and 7
    ld [wTextPalette], a
    pop hl
.advance:
    ld a, l
    ld [wAssetMap], a
    ld a, h
    ld [wAssetMap + 1], a
    ld a, [wWorldDrawing]
    and a
    jr nz, .visible
    ld a, b
    cp 20
    jr nc, .skip
    ld a, c
    cp 18
    jr nc, .skip
.visible:
    ld a, d
    call SetCell
.skip:
    ld a, [wMapCol]
    inc a
    ld [wMapCol], a
    ld b, a
    ld a, [wAssetCols]
    cp b
    jp nz, .cell
    ld a, [wMapRow]
    inc a
    ld [wMapRow], a
    ld b, a
    ld a, [wAssetRows]
    cp b
    jp nz, .row
    ret
