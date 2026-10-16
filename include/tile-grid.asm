; Flat integer arrays contain tile() handles; source RAM and ROM tables work.
DrawTileGrid:
IF TILE_GRID_ENABLED
    ld a, [wArg1 + 1]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ld b, a
    ld a, [wArg3 + 1]
    or b
    ret nz
    ld a, [wArg1]
    and a
    ret z
    cp 33
    ret nc
    ld [wGridCols], a
    ld a, [wArg2]
    cp 20
    ret nc
    ld [wGridX], a
    ld a, [wArg3]
    cp 18
    ret nc
    ld [wGridY], a
    ld a, [wArg0]
    ld [wGridPointer], a
    ld a, [wArg0 + 1]
    ld [wGridPointer + 1], a
    xor a
    ld [wGridCol], a
    ld [wGridRow], a
.cell:
    ld a, [wGridLength]
    ld c, a
    ld a, [wGridLength + 1]
    or c
    ret z
    ld a, [wGridBank]
    ld c, a
    ld a, [wGridBank + 1]
    ld b, a
    bit 7, b
    call z, SelectROMBank
    ld a, [wGridPointer]
    ld l, a
    ld a, [wGridPointer + 1]
    ld h, a
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, l
    ld [wGridPointer], a
    ld a, h
    ld [wGridPointer + 1], a
    ; Invalid handles are skipped; no indirect access outside the descriptor table.
    ld a, d
    and a
    jr nz, .next
    ld a, e
    cp ASSET_COUNT
    jr nc, .next
    ld l, e
    ld h, 0
    add hl, hl
    ld d, 0
    add hl, de
    ld de, GridTileDefinitions
    add hl, de
    ld a, [hli]
    and a
    jr z, .next
    ld a, [hli]
    ld d, a
    ld a, [hl]
    ld [wTextPalette], a
    ld a, [wGridCol]
    ld b, a
    ld a, [wGridX]
    add b
    cp 20
    jr nc, .next
    ld b, a
    ld a, [wGridRow]
    ld c, a
    ld a, [wGridY]
    add c
    cp 18
    ret nc
    ld c, a
    ld a, d
    call SetCell
.next:
    ld a, [wGridLength]
    ld l, a
    ld a, [wGridLength + 1]
    ld h, a
    dec hl
    ld a, l
    ld [wGridLength], a
    ld a, h
    ld [wGridLength + 1], a
    ld a, [wGridCol]
    inc a
    ld [wGridCol], a
    ld b, a
    ld a, [wGridCols]
    cp b
    jp nz, .cell
    xor a
    ld [wGridCol], a
    ld a, [wGridRow]
    inc a
    ld [wGridRow], a
    jp .cell
ENDC
    ret
