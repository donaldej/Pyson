IF WINDOW_ENABLED
; The window owns $9C00; the background owns $9800 in HUD programs.
ShowWindow:
    ld a, [wWindowOn]
    and a
    ret nz
    inc a
    ld [wWindowOn], a
    ld [wWindowControlDirty], a
    ret
HideWindow:
    ld a, [wWindowOn]
    and a
    ret z
    xor a
    ld [wWindowOn], a
    inc a
    ld [wWindowControlDirty], a
    ret
WindowPosition:
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ret nz
    ld a, [wArg0]
    cp 160
    ret nc
    ld b, a
    ld a, [wArg1]
    cp 144
    ret nc
    ld c, a
    ld a, [wWindowX]
    cp b
    jr nz, .changed
    ld a, [wWindowY]
    cp c
    ret z
.changed:
    ld a, b
    ld [wWindowX], a
    ld a, c
    ld [wWindowY], a
    ld a, 1
    ld [wWindowControlDirty], a
    ret
ClearWindow:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    cp 8
    ret nc
    ld d, a
    ld hl, wWindowTiles
    ld bc, WINDOW_BUFFER_BYTES
.tiles:
    xor a
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .tiles
    ld hl, wWindowAttrs
    ld bc, WINDOW_BUFFER_BYTES
.attributes:
    ld a, d
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .attributes
    ld hl, wWindowDirtyRows
    ld b, 18
    ld a, 1
.dirty:
    ld [hli], a
    dec b
    jr nz, .dirty
    ret

; A glyph, B column, C row. Same preservation contract as SetCell.
SetWindowCell:
    ld [wCellTile], a
    push hl
    push de
    push bc
    xor a
    ld [wWindowCellChanged], a
    ld h, 0
    ld l, c
    add hl, hl
    add hl, hl
    ld d, h
    ld e, l
    add hl, hl
    add hl, hl
    add hl, de ; row * 20
    ld e, b
    ld d, 0
    add hl, de
    ld de, wWindowTiles
    add hl, de
    ld a, [wCellTile]
    cp [hl]
    jr z, .palette
    ld [hl], a
    ld a, 1
    ld [wWindowCellChanged], a
.palette:
    ld de, WINDOW_ATTR_OFFSET
    add hl, de
    ld a, [wTextPalette]
    cp [hl]
    jr z, .dirty
    ld [hl], a
    ld a, 1
    ld [wWindowCellChanged], a
.dirty:
    ld a, [wWindowCellChanged]
    and a
    jr z, .done
    ld hl, wWindowDirtyRows
    ld e, c
    ld d, 0
    add hl, de
    ld [hl], 1
.done:
    pop bc
    pop de
    pop hl
    ret

; Burst copies are used only with LCD off or inside a fresh VBlank.
CopyWindowRow:
    ld b, 20
.copy:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .copy
    ret
WindowRowPointers:
    ld a, [wWindowRow]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    ld d, h
    ld e, l
    add hl, hl
    add hl, hl
    add hl, de ; row * 20 RAM offset
    push hl
    ld a, [wWindowRow]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl ; row * 32 VRAM offset
    ld a, h
    add $9C
    ld d, a
    ld e, l
    pop hl
    ret
FlushWindowRow:
    call WindowRowPointers
    push hl
    ld bc, wWindowTiles
    add hl, bc
    call CopyWindowRow
    pop hl
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .attributesDone
    ld a, 1
    ldh [$FF4F], a
    call WindowRowPointers
    ld bc, wWindowAttrs
    add hl, bc
    call CopyWindowRow
    xor a
    ldh [$FF4F], a
.attributesDone:
ENDC
    ld hl, wWindowDirtyRows
    ld a, [wWindowRow]
    ld e, a
    ld d, 0
    add hl, de
    ld [hl], 0
    ret

RefreshWithWindow:
    xor a
    ld [wWindowLCDPaused], a
    ld [wFlushRow], a
    ld [wWindowDirtyCount], a
    ; A bulk background edit requires a single-map upload with LCD paused.
    ld hl, wDirtyRows
    ld b, BG_BUFFER_ROWS
.backgroundCheck:
    ld a, [hli]
    and a
    jr nz, .pauseLCD
    dec b
    jr nz, .backgroundCheck
    jr .countWindow
.pauseLCD:
    call WaitVBlank
    ldh a, [$FF40]
    res 7, a
    ldh [$FF40], a
    ld a, 1
    ld [wWindowLCDPaused], a
    ld a, $98
    ld [wFlushBase], a
.backgroundRow:
    ld hl, wDirtyRows
    ld a, [wFlushRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [hl]
    and a
    jr z, .backgroundNext
    ld [hl], 0
    call FlushRowPointers
    push hl
    ld bc, wBGTiles
    add hl, bc
    call CopyVRAMRow
    pop hl
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .backgroundAttributesDone
    ld a, 1
    ldh [$FF4F], a
    call FlushRowPointers
    ld bc, wBGAttrs
    add hl, bc
    call CopyVRAMRow
    xor a
    ldh [$FF4F], a
.backgroundAttributesDone:
ENDC
.backgroundNext:
    ld a, [wFlushRow]
    inc a
    ld [wFlushRow], a
    cp BG_BUFFER_ROWS
    jr c, .backgroundRow
.countWindow:
    ld hl, wWindowDirtyRows
    ld b, 18
    ld c, 0
.count:
    ld a, [hli]
    and a
    jr z, .countNext
    inc c
    ld a, 18
    sub b
    ld [wWindowRow], a
.countNext:
    dec b
    jr nz, .count
    ld a, c
    ld [wWindowDirtyCount], a
    ld b, a
    ld a, [wWindowLCDPaused]
    or b
    ld b, a
    ld a, [wPaletteDirty]
    or b
    ld b, a
    ld a, [wOAMDirty]
    or b
    ld b, a
    ld a, [wCameraDirty]
    or b
    ld b, a
    ld a, [wWindowControlDirty]
    or b
IF SOUND_ENABLED
    ld b, a
    ld a, [wSoundActive]
    or b
IF MUSIC_ENABLED
    ld b, a
    ld a, [wMusicActive]
    or b
ENDC
ENDC
    ret z
    ld a, [wWindowLCDPaused]
    and a
    jr nz, .rows
    ld a, [wWindowDirtyCount]
    cp 2
    jr nc, .rows
    ld a, [wPaletteDirty]
    and a
    jr nz, .rows
    ; One small HUD row plus OAM and control registers fit in one VBlank.
    call WaitVBlank
    ld a, [wWindowDirtyCount]
    and a
    jr z, .commitSmall
    call FlushWindowRow
.commitSmall:
    jp CommitWindowFrame
.rows:
    xor a
    ld [wWindowRow], a
.row:
    ld hl, wWindowDirtyRows
    ld a, [wWindowRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [hl]
    and a
    jr z, .next
    ld a, [wWindowLCDPaused]
    and a
    jr nz, .flush
    call WaitVBlank
.flush:
    call FlushWindowRow
.next:
    ld a, [wWindowRow]
    inc a
    ld [wWindowRow], a
    cp 18
    jr c, .row
    ld a, [wWindowLCDPaused]
    and a
    jr nz, CommitWindowFrame
    call WaitVBlank
    jr CommitWindowFrame

CommitWindowFrame:
IF FRAME_CLOCK_ENABLED
    di
ENDC
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jp z, .palettesDone
    ld a, [wPaletteDirty]
    and a
    jp z, .palettesDone
    ld a, $80
    ldh [$FF68], a
    ld hl, wBGPalettes
    REPT 64
        ld a, [hli]
        ldh [$FF69], a
    ENDR
    ld a, $80
    ldh [$FF6A], a
    ld hl, wOBJPalettes
    REPT 64
        ld a, [hli]
        ldh [$FF6B], a
    ENDR
.palettesDone:
ENDC
    ld a, [wOAMDirty]
    and a
    jr z, .oamDone
    ld a, HIGH(wShadowOAM)
    call hOAMDMA
.oamDone:
    ld a, [wCameraX]
    ldh [$FF43], a
    ld a, [wCameraY]
    ldh [$FF42], a
    ld a, [wWindowX]
    add 7
    ldh [$FF4B], a
    ld a, [wWindowY]
    ldh [$FF4A], a
    ld a, [wWindowOn]
    and a
    ldh a, [$FF40]
    res 3, a ; background $9800
    set 6, a ; window $9C00
    res 5, a
    jr z, .hidden
    set 5, a
.hidden:
    set 7, a
    ldh [$FF40], a
    xor a
    ld [wFrontMap], a
    ld [wPaletteDirty], a
    ld [wOAMDirty], a
    ld [wCameraDirty], a
    ld [wWindowControlDirty], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret
ENDC
