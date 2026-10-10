; Shared asset handles: background=2, bit-packed collision=3, nested map=4.
QueryMapDescriptor:
    ld a, [wArg0 + 1]
    and a
    jr nz, .invalid
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 2
    jr z, .valid
    cp 3
    jr z, .valid
    cp 4
    jr z, .valid
    cp 7
    jr z, .valid
IF STREAM_ENABLED
    cp 6
    jr z, .valid
ENDC
    jr .invalid
.valid:
    ld [wAssetCount], a
    push af
    call ReadDescriptor
    pop af
    ld [wAssetCount], a
IF STREAM_ENABLED
    cp 6
    jp z, StreamReadHeader
ENDC
    and a
    ret
.invalid:
    scf
    ret

MapWidth:
    call QueryMapDescriptor
    ld hl, -1
    ret c
    ld a, [wAssetCols]
    ld l, a
    ld h, 0
    ret
MapHeight:
    call QueryMapDescriptor
    ld hl, -1
    ret c
    ld a, [wAssetRows]
    ld l, a
    ld h, 0
    ret

; Returns HL=row-major cell offset. Coordinates are unsigned bounded bytes.
QueryMapOffset:
    call QueryMapDescriptor
    ret c
    ld a, [wArg1 + 1]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    jr nz, .invalid
    ld a, [wAssetCols]
    ld b, a
    ld a, [wArg1]
    cp b
    jr nc, .invalid
    ld a, [wAssetRows]
    ld b, a
    ld a, [wArg2]
    cp b
    jr nc, .invalid
IF STREAM_ENABLED
    ld a, [wAssetCount]
    cp 6
    jp z, StreamCellAddress
ENDC
    ld a, [wArg2]
    ld b, a
    ld a, [wAssetCols]
    ld e, a
    ld d, 0
    ld hl, 0
    ld a, b
    and a
    jr z, .column
.row:
    add hl, de
    dec b
    jr nz, .row
.column:
    ld a, [wArg1]
    ld e, a
    add hl, de
    and a
    ret
.invalid:
    scf
    ret

TileAt:
    call QueryMapOffset
    jr c, .invalid
    ld a, [wAssetCount]
IF STREAM_ENABLED
    cp 6
    jr nz, .ordinary
    ld a, [hli]
    ld h, [hl]
    ld l, a
    ret
.ordinary:
ENDC
    cp 4
    jr z, .manual
    cp 7
    jr z, .manual
    cp 2
    jr nz, .invalid
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld l, [hl]
    ld h, 0
    ret
.manual:
    call ManualCellAddress
    ld l, [hl]
    ld h, 0
    ret
.invalid:
    ld hl, -1
    ret

; HL cell index -> HL address of tile, palette/solid flags, terrain.
ManualCellAddress:
    ld a, [wAssetCount]
    cp 7
    jr nz, .immutable
    ld d, h
    ld e, l
    add hl, hl
    add hl, de
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ret
.immutable:
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    inc hl
    inc hl
    ld a, [hl] ; local tile definition ID
    ld l, a
    ld h, 0
    add hl, hl
    ld e, a
    ld d, 0
    add hl, de
    push hl
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld a, [hli]
    ld h, [hl]
    ld l, a
    pop de
    add hl, de
    ret

TileTerrain:
    call QueryMapOffset
    jr c, .invalid
    ld a, [wAssetCount]
IF STREAM_ENABLED
    cp 6
    jr nz, .ordinary
    inc hl
    inc hl
    inc hl
    ld l, [hl]
    ld h, 0
    ret
.ordinary:
ENDC
    cp 4
    jr z, .manual
    cp 7
    jr nz, .invalid
.manual:
    call ManualCellAddress
    inc hl
    inc hl
    ld l, [hl]
    ld h, 0
    ret
.invalid:
    ld hl, -1
    ret

TileIsSolid:
    call QueryMapOffset
    jr c, .solid
    ld a, [wAssetCount]
IF STREAM_ENABLED
    cp 6
    jr nz, .ordinary
    inc hl
    jr .streamFlags
.ordinary:
ENDC
    cp 4
    jr z, .manual
    cp 7
    jr z, .manual
    cp 3
    jr nz, .solid
    ld a, l
    and 7
    ld b, a
    srl h
    rr l
    srl h
    rr l
    srl h
    rr l
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    add hl, de
    ld a, [hl]
    inc b
.shift:
    rrca
    dec b
    jr nz, .shift
    ld hl, 0
    ret nc
    jr .solid
.manual:
    call ManualCellAddress
IF STREAM_ENABLED
.streamFlags:
ENDC
    inc hl
    bit 7, [hl]
    ld hl, 0
    ret z
.solid:
    ld hl, 1
    ret
