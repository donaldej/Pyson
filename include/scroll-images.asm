; Exclusive tall illustrations (credits, illustrated prologues). The 32-row
; hardware map is a ring; ordinary one-row moves upload only the entering row.
ShowScroll:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 13
    ret nz
    call ReadDescriptor
    ld a, [wDescriptorBank + 1]
    ld [wScrollBank + 1], a
    ld a, [wDescriptorBank]
    ld [wScrollBank], a
    ld a, [wAssetRows]
    ld [wScrollRows], a
    sub 18
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    ld a, [wArg1]
    ld e, a
    ld a, [wArg1 + 1]
    ld d, a
    bit 7, d
    jr z, .positive
    ld de, 0
.positive:
    ld a, e
    sub l
    ld a, d
    sbc h
    jr c, .clamped
    ld d, h
    ld e, l
.clamped:
    ld a, e
    ld [wScrollPosition], a
    ld a, d
    ld [wScrollPosition + 1], a
    REPT 3
        srl d
        rr e
    ENDR
    ld a, e
    ld [wScrollTarget], a
    ld a, [wScrollReady]
    and a
    jr z, .new
    ld a, [wImageActive]
    and a
    jr z, .new
    ld a, [wArg0]
    ld b, a
    ld a, [wScrollID]
    cp b
    jr z, .loaded
.new:
    call ShowImage
    ; The map begins after palette, monochrome palette, length, and patterns.
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld de, IMAGE_PALETTE_BYTES + 1 + IMAGE_FAMILIES
    add hl, de
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    add hl, de
    ld a, l
    ld [wScrollMap], a
    ld a, h
    ld [wScrollMap + 1], a
    ld a, [wArg0]
    ld [wScrollID], a
    ld a, 1
    ld [wScrollReady], a
    jr .rebuild
.loaded:
    ld a, [wScrollTop]
    ld b, a
    ld a, [wScrollTarget]
    cp b
    jr z, .fine
    sub b
    cp 1
    jr z, .down
    cp $FF
    jr z, .up
    call ImageLCDOff
    ld a, 2
    ld [wImageActive], a
.rebuild:
    ld a, [wScrollTarget]
    ld b, 32
.rows:
    push bc
    push af
    call ScrollCopyRow
    pop af
    inc a
    pop bc
    dec b
    jr nz, .rows
    jr .position
.down:
    call WaitVBlank
    ld a, [wScrollTarget]
    add 18
    call ScrollCopyRow
    jr .position
.up:
    call WaitVBlank
    ld a, [wScrollTarget]
    call ScrollCopyRow
    jr .position
.fine:
    call WaitVBlank
.position:
    ld a, [wScrollTarget]
    ld [wScrollTop], a
    ld a, [wScrollPosition]
    ld [wCameraY], a
    ldh [$FF42], a
    ret

; A source row (and destination ring row). Source edges repeat safely.
ScrollCopyRow:
    push af
    ld a, [wScrollBank]
    ld c, a
    ld a, [wScrollBank + 1]
    ld b, a
    call SelectROMBank
    pop af
    push af
    and 31
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld de, $9800
    add hl, de
    ld d, h
    ld e, l
    pop af
    ld b, a
    ld a, [wScrollRows]
    cp b
    ld a, b
    jr z, .edge
    jr nc, .source
.edge:
    ld a, [wScrollRows]
    dec a
.source:
    ; row * 20 = row * 16 + row * 4
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    ld b, h
    ld c, l
    add hl, hl
    add hl, hl
    add hl, bc
    ld a, [wScrollMap]
    ld c, a
    ld a, [wScrollMap + 1]
    ld b, a
    add hl, bc
    ld b, 20
.cell:
    ld a, [hli]
    ld [de], a
    set 2, d
    ld [de], a
    res 2, d
    inc de
    dec b
    jr nz, .cell
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    ret z
    ld a, 1
    ldh [$FF4F], a
IF IMAGE_MULTIPALETTE
    ; HL is the end of this tile-map row. The equal-sized attribute plane
    ; follows the complete map, including for ordinary single-palette assets.
    ld a, [wScrollRows]
    ld c, a
    ld b, 0
    push hl
    ld h, b
    ld l, c
    add hl, hl
    add hl, hl
    ld b, h
    ld c, l
    add hl, hl
    add hl, hl
    add hl, bc
    ld b, h
    ld c, l
    pop hl
    add hl, bc
ENDC
    ld b, 20
.attrs:
    dec de
IF IMAGE_MULTIPALETTE
    dec hl
    ld a, [hl]
ELSE
    xor a
ENDC
    ld [de], a
    set 2, d
    ld [de], a
    res 2, d
    dec b
    jr nz, .attrs
    xor a
    ldh [$FF4F], a
ENDC
    ret
