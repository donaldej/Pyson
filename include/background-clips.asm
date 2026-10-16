; Upload only the invisible pattern buffer, then queue its map for normal refresh.
DrawBackground:
IF CLIP_ENABLED
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ld b, a
    ld a, [wArg3 + 1]
    or b
    ret nz
    ld a, [wArg2]
    cp 20
    ret nc
    ld [wClipX], a
    ld a, [wArg3]
    cp 18
    ret nc
    ld [wClipY], a
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 8
    ret nz
    push hl
    inc hl
    inc hl
    ld a, [wArg1]
    cp [hl]
    pop hl
    ret nc
    ld [wClipFrame], a
    ; A second call before refresh first commits the already queued frame.
    ld a, [wClipPending]
    and a
    push hl
    call nz, RefreshScreen
    pop hl
    call ReadDescriptor
    call PrepareBackgroundClipCells
    ld a, [wClipFront]
    xor 1
    ld [wClipTarget], a
    ld a, CLIP_TILE_BASE
    jr z, .base
    add CLIP_TILE_SPAN
.base:
    ld [wClipTileBase], a
    ; Resolve a frame's bank/address from the four-byte index record.
    ld a, [wClipFrame]
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
    call SelectROMBank
    ld h, d
    ld l, e
    ld a, [hli]
    ld b, a
    ; Pattern bytes occupy a disjoint range from the displayed clip.
    ld a, [wClipTileBase]
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
    ; Audio servicing is bounded to one small tile, rather than a whole upload.
    call SyncFrameAudio
    pop bc
    dec b
    jr nz, .tile
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
    ld a, [wClipX]
    add b
    ld b, a
    ld a, [wMapRow]
    ld c, a
    ld a, [wClipY]
    add c
    ld c, a
    ld a, [hli]
    push af
    ld a, b
    cp 20
    jr nc, .skip
    ld a, c
    cp 18
    jr nc, .skip
    pop af
    ld d, a
    ld a, [wClipTileBase]
    add d
    call SetCell
    jr .next
.skip:
    pop af
.next:
    ld a, [wMapCol]
    inc a
    ld [wMapCol], a
    ld b, a
    ld a, [wAssetCols]
    cp b
    jr nz, .cell
    ld a, [wMapRow]
    inc a
    ld [wMapRow], a
    ld b, a
    ld a, [wAssetRows]
    cp b
    jr nz, .row
    ld a, 1
    ld [wClipPending], a
ENDC
    ret

IF CLIP_ENABLED
PrepareBackgroundClipCells:
    ld a, [wClipLastX]
    ld b, a
    ld a, [wClipX]
    cp b
    jr nz, .changed
    ld a, [wClipLastY]
    ld b, a
    ld a, [wClipY]
    cp b
    jr nz, .changed
    ld a, [wClipLastCols]
    ld b, a
    ld a, [wAssetCols]
    cp b
    jr nz, .changed
    ld a, [wClipLastRows]
    ld b, a
    ld a, [wAssetRows]
    cp b
    ret z
.changed:
    call ClearBackgroundClipCells
    ld a, [wClipX]
    ld [wClipLastX], a
    ld a, [wClipY]
    ld [wClipLastY], a
    ld a, [wAssetCols]
    ld [wClipLastCols], a
    ld a, [wAssetRows]
    ld [wClipLastRows], a
    ret

; Remove old dynamic references before placing a moved/resized clip. Static
; text and ordinary map tiles are preserved. The old visible map stays intact.
ClearBackgroundClipCells:
    ld hl, wBGTiles
    ld de, wDirtyRows
    ld b, 18
.row:
    ld c, 32
.cell:
    ld a, [hl]
    cp CLIP_TILE_BASE
    jr c, .next
IF CLIP_TILE_BASE + CLIP_TILE_SPAN * 2 < 256
    cp CLIP_TILE_BASE + CLIP_TILE_SPAN * 2
    jr nc, .next
ENDC
    xor a
    ld [hl], a
    push hl
    push de
    ld de, ATTR_OFFSET
    add hl, de
    ld [hl], a
    pop de
    pop hl
    ld a, 3
    ld [de], a
.next:
    inc hl
    dec c
    jr nz, .cell
    inc de
    dec b
    jr nz, .row
    ret
ENDC
