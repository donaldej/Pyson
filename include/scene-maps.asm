; Scene patterns occupy only the unused resident range at $8800. Loading a
; different scene is a transition; moving its tile camera never stops the LCD.
DrawScene:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 12
    ret nz
    call ReadDescriptor
    ld a, [wDescriptorBank + 1]
    ld [wSceneBank + 1], a
    ld a, [wDescriptorBank]
    ld [wSceneBank], a
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld de, IMAGE_PALETTE_BYTES + 1
    add hl, de
    ld a, [hli]
    ld c, a
    ld a, [hli]
    ld b, a
    push hl
    add hl, bc
    ld a, l
    ld [wSceneMap], a
    ld a, h
    ld [wSceneMap + 1], a
    pop hl
    ld a, [wArg0]
    ld d, a
    ld a, [wSceneHandle]
    cp d
    jr nz, .load
    ld a, [wSceneActive]
    and a
    jr nz, .layout
.load:
    xor a
    ld [wMaskedCacheReady], a
    ld a, l
    ld [wScenePatterns], a
    ld a, h
    ld [wScenePatterns + 1], a
    ld a, d
    ld [wSceneHandle], a
    ldh a, [$FF40]
    ld [wSceneLCD], a
    push hl
    push bc
    call ImageLCDOff
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld de, wBGPalettes
    ld bc, IMAGE_PALETTE_BYTES
    call CopyImageData
IF MASKED_FILL_ENABLED
    call SyncMaskedPalettes
ENDC
    ld a, [hl]
    ld [wSceneDmgPalette], a
    ldh [$FF47], a
    ld a, 1
    ld [wPaletteDirty], a
    pop bc
    pop hl
    ld de, $8800 + SCENE_TILE_BASE * 16
    ld a, b
    or c
    call nz, CopyImageData
    ld a, 1
    ld [wSceneActive], a
    ld a, 255
    ld [wSceneLastTileX], a
    ld a, [wSceneLCD]
    ldh [$FF40], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
.layout:
    ; Clamp a signed pixel camera, retaining its fine hardware-scroll phase.
    ld a, [wArg1 + 1]
    bit 7, a
    jr nz, .zero
    ld h, a
    ld a, [wArg1]
    and 7
    ld [wSceneFineNext], a
    ld a, [wArg1]
    ld l, a
    REPT 3
        srl h
        rr l
    ENDR
    ld a, h
    and a
    jr nz, .maximum
    ld c, l
    ld a, [wAssetCols]
    sub 20
    cp c
    jr z, .maximum
    jr c, .maximum
    ld a, c
    jr .camera
.maximum:
    xor a
    ld [wSceneFineNext], a
    ld a, [wAssetCols]
    sub 20
    jr .camera
.zero:
    xor a
    ld [wSceneFineNext], a
.camera:
    ld [wSceneX], a
    ld a, [wSceneFineNext]
    ld b, a
    ld a, [wSceneFine]
    cp b
    jr z, .phaseReady
    ld a, 1
    ld [wCameraDirty], a
.phaseReady:
    ldh a, [$FF41]
    bit 6, a
    jr nz, .configured
    ld a, SCENE_HUD_ROWS * 8 - 1
IF CPU_DOUBLE_SPEED
    ; Double-speed CGB can apply SCX during the first scene row's OAM scan.
    ; This avoids waiting in an HBlank that active HDMA may occupy.
    ld b, a
    ld a, [wIsCGB]
    and a
    ld a, b
    jr z, .rasterLineReady
    inc a
.rasterLineReady:
ENDC
    ldh [$FF45], a
    ldh a, [$FF41]
    or $40
    ldh [$FF41], a
    ldh a, [$FF0F]
    and $FD
    ldh [$FF0F], a
    ldh a, [$FFFF]
    or 2
    ldh [$FFFF], a
.configured:
    ld a, [wSceneX]
    ld b, a
    ld a, [wSceneLastTileX]
    cp b
    ret z
    ld a, [wSceneX]
    ld e, a
    ld d, 0
    ld a, [wSceneMap]
    ld l, a
    ld a, [wSceneMap + 1]
    ld h, a
    add hl, de
    ld c, SCENE_HUD_ROWS
    ld de, wMaskedBase + SCENE_HUD_ROWS * 32
    xor a
    ld [wTextPalette], a
    inc a
    ld [wMaskedDirty], a
    ; Rows 0/1 belong to the HUD. Seek past them in the banked scene map.
    ld a, [wAssetCols]
    push de
    ld e, a
    ld d, 0
    REPT SCENE_HUD_ROWS
        add hl, de
    ENDR
    pop de
.row:
    ld b, 0
.cell:
    push de
    ; The hidden extra column repeats the edge when a view ends exactly at
    ; the image boundary. Never read into the next asset's ROM data.
    ld a, b
    cp 20
    jr nz, .readCell
    ld a, [wSceneX]
    add 20
    ld d, a
    ld a, [wAssetCols]
    cp d
    jr nz, .readCell
    dec hl
    ld a, [hli]
    inc hl
    jr .paintCell
.readCell:
    ld a, [hli]
.paintCell:
    ; A scene row is already clipped and always uses palette zero. Copy its
    ; stationary IDs directly; ComposeMasked restores the visible shadow from
    ; this base before adding actors. Avoid the general SetCell call per tile.
    pop de
    add 128
    ld [de], a
    inc de
    inc b
    ld a, b
    cp 21
    jr c, .cell
    ; Keep SetCell's comparison shadow in step with the restored scenery.
    ; Otherwise repeating the same text after a forced restore would appear
    ; unchanged to SetCell and disappear from the stationary base.
    push hl
    push de
    push bc
    ld h, d
    ld l, e
    ld bc, -21
    add hl, bc
    ld de, wBGTiles - wMaskedBase
    add hl, de
    ld d, h
    ld e, l
    ld hl, wMaskedBase - wBGTiles
    add hl, de
    ld bc, 21
    call CopyArray
    pop bc
    pop de
    pop hl
    push hl
    ld hl, wBGAttrs - wMaskedBase - 21
    add hl, de
IF IMAGE_MULTIPALETTE
    push de
    push bc
    ld d, h
    ld e, l
    ld a, [wAssetCols]
    ld l, a
    ld h, 0
    push hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    pop bc
    add hl, bc
    add hl, bc
    ; HL is 18 * columns, the offset to the attribute plane.
    ld b, h
    ld c, l
    ld a, [wSceneMap]
    ld l, a
    ld a, [wSceneMap + 1]
    ld h, a
    add hl, bc
    pop bc
    push bc
    ld b, c
    ld a, [wAssetCols]
    ld c, a
.attributeSeek:
    push de
    ld d, 0
    ld e, c
    add hl, de
    pop de
    dec b
    jr nz, .attributeSeek
    ld a, [wSceneX]
    push de
    ld e, a
    ld d, 0
    add hl, de
    pop de
    ld b, 0
.attributes:
    ld a, b
    cp 20
    jr nz, .attributeRead
    ld a, [wSceneX]
    add 20
    cp c
    jr nz, .attributeRead
    dec hl
.attributeRead:
    ld a, [hli]
    ld [de], a
    inc de
    inc b
    ld a, b
    cp 21
    jr c, .attributes
    pop bc
    pop de
ELSE
    ld b, 21
    xor a
.attributes:
    ld [hli], a
    dec b
    jr nz, .attributes
ENDC
    ld l, c
    ld h, 0
    push de
    ld de, wDirtyRows
    add hl, de
    ld a, [hl]
    or 15
    ld [hl], a
    pop de
    pop hl
    REPT 11
        inc de
    ENDR
    push de
    ld a, [wAssetCols]
    sub 21
    ld e, a
    ld d, 0
    jr nc, .stride
    dec d
.stride:
    add hl, de
    pop de
    inc c
    ld a, c
    cp 18
    jp c, .row
IF MASKED_FILL_ENABLED
    call SaveMaskedAttributes
ENDC
    ld a, [wSceneX]
    ld [wSceneLastTileX], a
    ret

SceneReset:
    ldh a, [$FFFF]
    and $FD
    ldh [$FFFF], a
    xor a
    ld [wMaskedCacheReady], a
    ld [wSceneActive], a
    ld [wSceneFine], a
    ld [wSceneFineNext], a
    ldh [$FF43], a
    ldh a, [$FF41]
    and $BF
    ldh [$FF41], a
    ldh a, [$FF0F]
    and $FD
    ldh [$FF0F], a
    ret

SceneRasterInterrupt:
    push af
IF CPU_DOUBLE_SPEED
    ld a, [wIsCGB]
    and a
    jr nz, .applyScroll
ENDC
.hblank:
    ldh a, [$FF41]
    and 3
    jr nz, .hblank
.applyScroll:
    ld a, [wSceneFine]
    ldh [$FF43], a
    pop af
    reti
