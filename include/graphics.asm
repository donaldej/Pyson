; Drawing updates RAM. Background-only programs flip a prepared hidden map.
; Window programs reserve the second hardware map and use RefreshWithWindow.
InitGraphics:
    xor a
    ld hl, wShadowOAM
    ld b, 160
.clear:
    ld [hli], a
    dec b
    jr nz, .clear
    ld hl, DefaultPalettes
    ld de, wBGPalettes
    ld b, 128
.palettes:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .palettes
    ld a, 1
    ld [wPaletteDirty], a
    ld [wOAMDirty], a
    ret

; A tile ID, B column, C row. Preserves HL/DE/BC.
SetCell:
IF WINDOW_ENABLED
    push af
    ld a, [wWindowText]
    and a
    jr z, .background
    pop af
    jp SetWindowCell
.background:
    pop af
ENDC
    ld [wCellTile], a
    push hl
    push de
    push bc
    ld h, 0
    ld l, c
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    ld de, wBGTiles
    add hl, de
    ld d, 0
    ld e, b
    add hl, de
    ld a, [wCellTile]
    ld [hl], a
    ld de, ATTR_OFFSET
    add hl, de
    ld a, [wTextPalette]
    ld [hl], a
    ld hl, wDirtyRows
    ld d, 0
    ld e, c
    add hl, de
    ld a, [hl]
    or 3
    ld [hl], a
    pop bc
    pop de
    pop hl
    ret

ClearScreen:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    cp 8
    ret nc
    ld [wTextPalette], a
    call ResetCamera
    ld hl, wBGTiles
    ld bc, BG_BUFFER_BYTES
.tiles:
    xor a
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .tiles
    ld hl, wBGAttrs
    ld bc, BG_BUFFER_BYTES
.attributes:
    ld a, [wTextPalette]
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .attributes
    ld hl, wDirtyRows
    ld b, BG_BUFFER_ROWS
    ld a, 3
.dirty:
    ld [hli], a
    dec b
    jr nz, .dirty
    ret

SetBGPalette:
    ld de, wBGPalettes
    jr SetPalette
SetSpritePalette:
    ld de, wOBJPalettes
SetPalette:
    push hl
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, de
    ld d, h
    ld e, l
    pop hl
    ld b, 8
.copy:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .copy
    ld a, 1
    ld [wPaletteDirty], a
    ret

; Copy a 32-tile row into an invisible map, avoiding mode 3.
CopyVRAMRow:
    ld b, 32
.copy:
    ld c, [hl]
.wait:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ldh a, [$FF41]
    and 2
    jr nz, .wait
    ld a, c
    ld [de], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    inc hl
    inc de
    dec b
    jr nz, .copy
    ret

RefreshScreen:
IF STREAM_ENABLED
    call TryRefreshStream
    ret c
ENDC
IF WINDOW_ENABLED
    jp RefreshWithWindow
ENDC
    xor a
    ld [wMapPending], a
    ld [wFlushRow], a
    ld a, [wFrontMap]
    and a
    ld a, 2
    ld b, $9C
    jr z, .chosen
    ld a, 1
    ld b, $98
.chosen:
    ld [wFlushMask], a
    ld a, b
    ld [wFlushBase], a
.row:
    ld hl, wDirtyRows
    ld a, [wFlushRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [wFlushMask]
    and [hl]
    jp z, .next
    ; Prepare source and destination row pointers.
    call FlushRowPointers
    push hl
    ld bc, wBGTiles
    add hl, bc
    call CopyVRAMRow
    pop hl
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .attributesDone
    ld a, 1
    ldh [$FF4F], a
    push hl
    call FlushRowPointers
    ld bc, wBGAttrs
    add hl, bc
    call CopyVRAMRow
    pop hl
    xor a
    ldh [$FF4F], a
.attributesDone:
ENDC
    ld hl, wDirtyRows
    ld a, [wFlushRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [wFlushMask]
    cpl
    and [hl]
    ld [hl], a
    ld a, 1
    ld [wMapPending], a
.next:
    ld a, [wFlushRow]
    inc a
    ld [wFlushRow], a
    cp BG_BUFFER_ROWS
    jp c, .row
    ld a, [wPaletteDirty]
    ld b, a
    ld a, [wOAMDirty]
    or b
    ld b, a
    ld a, [wCameraDirty]
    or b
    ld b, a
    ld a, [wMapPending]
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
    call WaitVBlank
CommitGraphicsFrame:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ; Unrolled palette writes plus OAM DMA fit inside one normal-speed VBlank.
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
    ld a, [wMapPending]
    and a
    jr z, .flipDone
    ldh a, [$FF40]
    xor 8
    ldh [$FF40], a
    ld a, [wFrontMap]
    xor 1
    ld [wFrontMap], a
.flipDone:
IF CLIP_ENABLED
    ld a, [wClipPending]
    and a
    jr z, .clipDone
    ld a, [wClipTarget]
    ld [wClipFront], a
    xor a
    ld [wClipPending], a
.clipDone:
ENDC
    ld a, [wCameraX]
    ldh [$FF43], a
    ld a, [wCameraY]
    ldh [$FF42], a
    xor a
    ld [wCameraDirty], a
    ld [wPaletteDirty], a
    ld [wOAMDirty], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

FlushRowPointers:
    ld a, [wFlushRow]
    ld h, 0
    ld l, a
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    add hl, hl
    ld a, [wFlushBase]
    add h
    ld d, a
    ld e, l
    ret

; This position-independent code is copied to HRAM before enabling the LCD.
DMARoutine:
    ldh [$FF46], a
    ld a, 40
.wait:
    dec a
    jr nz, .wait
    ret
DMARoutineEnd:
