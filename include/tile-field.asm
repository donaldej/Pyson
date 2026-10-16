; Sum separable column/row offsets and map through a power-of-two tile palette.
DrawTileField:
IF TILE_FIELD_ENABLED
    ld a, [wArg3 + 1]
    ld b, a
    ld a, [wArg4 + 1]
    or b
    ret nz
    ld a, [wArg3]
    cp 20
    ret nc
    ld [wFieldX], a
    ld a, [wArg4]
    cp 18
    ret nc
    ld [wFieldY], a
    ld a, [wFieldLength0 + 1]
    and a
    jr nz, .wide
    ld a, [wFieldLength0]
    and a
    ret z
    cp 33
    jr c, .width
.wide:
    ld a, 32
.width:
    ld [wFieldWidth], a
    ld a, [wFieldLength1 + 1]
    and a
    jr nz, .tall
    ld a, [wFieldLength1]
    and a
    ret z
    cp 33
    jr c, .height
.tall:
    ld a, 32
.height:
    ld [wFieldHeight], a
    ld a, [wFieldLength2 + 1]
    and a
    ret nz
    ld a, [wFieldLength2]
    cp 2
    ret c
    cp 65
    ret nc
    ld b, a
    dec a
    ld [wFieldMask], a
    and b
    ret nz
    ; Resolve the small tile palette once; the pixel loop does no asset lookup.
    ld a, [wFieldBank2]
    ld c, a
    ld a, [wFieldBank2 + 1]
    ld b, a
    bit 7, b
    call z, SelectROMBank
    ld a, [wArg2]
    ld l, a
    ld a, [wArg2 + 1]
    ld h, a
    ld de, wFieldPalette
    ld a, [wFieldLength2]
    ld b, a
.palette:
    push bc
    ld a, [hli]
    ld c, a
    ld a, [hli]
    push hl
    push de
    and a
    jr nz, .invalid
    ld a, c
    cp ASSET_COUNT
    jr nc, .invalid
    ld l, c
    ld h, 0
    add hl, hl
    ld e, c
    ld d, 0
    add hl, de
    ld de, GridTileDefinitions
    add hl, de
    ld a, [hli]
    and a
    jr z, .invalid
    ld a, [hli]
    ld b, a
    ld c, [hl]
    jr .resolved
.invalid:
    ld b, 0
    ld c, 0
.resolved:
    pop de
    ld a, b
    ld [de], a
    inc de
    ld a, c
    ld [de], a
    inc de
    pop hl
    pop bc
    dec b
    jr nz, .palette
    ld a, [wArg0]
    ld [wFieldColumns], a
    ld a, [wArg0 + 1]
    ld [wFieldColumns + 1], a
    ld a, [wArg1]
    ld [wFieldRows], a
    ld a, [wArg1 + 1]
    ld [wFieldRows + 1], a
    xor a
    ld [wFieldRow], a
.row:
IF FRAME_CLOCK_ENABLED
    call SyncFrameAudio
ENDC
    ld a, [wFieldRow]
    ld c, a
    ld a, [wFieldY]
    add c
    cp 18
    ret nc
    ; Dirty both hardware maps, then form the destination pointer in RAM.
    ld l, a
    ld h, 0
    ld de, wDirtyRows
    add hl, de
    ld [hl], 3
    ld a, [wFieldRow]
    ld c, a
    ld a, [wFieldY]
    add c
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld de, wBGTiles
    add hl, de
    ld a, [wFieldX]
    ld e, a
    ld d, 0
    add hl, de
    push hl
    ; Read one row value, then switch once for the column source.
    ld a, [wFieldBank1]
    ld c, a
    ld a, [wFieldBank1 + 1]
    ld b, a
    bit 7, b
    call z, SelectROMBank
    ld a, [wFieldRows]
    ld l, a
    ld a, [wFieldRows + 1]
    ld h, a
    ld c, [hl]
    inc hl
    inc hl
    ld a, l
    ld [wFieldRows], a
    ld a, h
    ld [wFieldRows + 1], a
    push bc
    ld a, [wFieldBank0]
    ld c, a
    ld a, [wFieldBank0 + 1]
    ld b, a
    bit 7, b
    call z, SelectROMBank
    pop bc
    ld a, [wFieldMask]
    ld b, a
    pop de
    ld a, [wFieldX]
    ld l, a
    ld a, 20
    sub l
    ld l, a
    ld a, [wFieldWidth]
    cp l
    jr c, .count
    ld a, l
.count:
    ld [wFieldLeft], a
    ld a, [wFieldColumns]
    ld l, a
    ld a, [wFieldColumns + 1]
    ld h, a
.cell:
    ld a, [hli]
    inc hl
    add c
    and b
    push hl
    ld l, a
    ld h, 0
    add hl, hl
    push de
    ld de, wFieldPalette
    add hl, de
    ld a, [hli]
    pop de
    ld [de], a
    inc de
    ld a, [hl]
    ld hl, ATTR_OFFSET - 1
    add hl, de
    ld [hl], a
    pop hl
    ld a, [wFieldLeft]
    dec a
    ld [wFieldLeft], a
    jr nz, .cell
    ld a, [wFieldRow]
    inc a
    ld [wFieldRow], a
    ld c, a
    ld a, [wFieldHeight]
    cp c
    jp nz, .row
ENDC
    ret
