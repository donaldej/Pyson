; wArg0 map, wArg1/2 pixel top-left, wArg3/4 positive width/height.
; Invalid bounds and maps are solid. All covered cells are checked, not corners.
MACRO TerrainRectBounds
    ld a, [wArg\2 + 1]
    bit 7, a
    jp nz, TerrainRectSolid
    ld d, a
    ld a, [wArg\2]
    ld e, a
    or d
    jp z, TerrainRectSolid
    ld a, [wArg\1 + 1]
    bit 7, a
    jp nz, TerrainRectSolid
    ld h, a
    ld a, [wArg\1]
    ld l, a
    ; x + width - 1: decrement the size first to preserve endpoints at 65535.
    dec de
    add hl, de
    jp c, TerrainRectSolid
    REPT 3
        srl h
        rr l
    ENDR
    ld a, h
    and a
    jp nz, TerrainRectSolid
    ld a, l
    ld [\4], a
    ld a, [wArg\1]
    ld l, a
    ld a, [wArg\1 + 1]
    ld h, a
    REPT 3
        srl h
        rr l
    ENDR
    ld a, h
    and a
    jp nz, TerrainRectSolid
    ld a, l
    ld [\3], a
ENDM
RectIsSolid:
    TerrainRectBounds 1, 3, wTerrainRectLeft, wTerrainRectRight
    TerrainRectBounds 2, 4, wTerrainRectTop, wTerrainRectBottom
    ld a, [wTerrainRectTop]
    ld [wTerrainRectRow], a
.row:
    ld a, [wTerrainRectLeft]
    ld [wTerrainRectColumn], a
.cell:
    ld a, [wTerrainRectColumn]
    ld [wArg1], a
    ld a, [wTerrainRectRow]
    ld [wArg2], a
    xor a
    ld [wArg1 + 1], a
    ld [wArg2 + 1], a
    call TileIsSolid
    ld a, l
    and a
    jp nz, TerrainRectSolid
    ld a, [wTerrainRectRight]
    ld b, a
    ld a, [wTerrainRectColumn]
    cp b
    jr z, .nextRow
    inc a
    ld [wTerrainRectColumn], a
    jr .cell
.nextRow:
    ld a, [wTerrainRectBottom]
    ld b, a
    ld a, [wTerrainRectRow]
    cp b
    jr z, .clear
    inc a
    ld [wTerrainRectRow], a
    jr .row
.clear:
    ld hl, 0
    ret
TerrainRectSolid:
    ld hl, 1
    ret
