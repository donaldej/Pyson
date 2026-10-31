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
IF MASKED_ENABLED
    add 128
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
    cp [hl]
    jr nz, .changed
    push hl
    ld de, ATTR_OFFSET
    add hl, de
    ld a, [wTextPalette]
    cp [hl]
    pop hl
    jr z, .unchanged
.changed:
    ld b, 3
IF MASKED_ENABLED && COLOR_ENABLED
    push hl
    ld de, ATTR_OFFSET
    add hl, de
    ld a, [wTextPalette]
    cp [hl]
    pop hl
    jr z, .sameAttribute
    ld b, 15
.sameAttribute:
ENDC
IF SCENE_ENABLED
    ld a, [wSceneActive]
    and a
    jr z, .sceneCellDone
    ld a, c
    cp SCENE_HUD_ROWS
    jr c, .sceneCellDone
    ld a, 255
    ld [wSceneLastTileX], a
.sceneCellDone:
ENDC
    ld a, [wCellTile]
    ld [hl], a
IF MASKED_ENABLED
    push hl
    ld de, wMaskedBase - wBGTiles
    add hl, de
    ld [hl], a
    ld a, 1
    ld [wMaskedDirty], a
    pop hl
ENDC
    ld de, ATTR_OFFSET
    add hl, de
    ld a, [wTextPalette]
    ld [hl], a
IF MASKED_FILL_ENABLED
    call SaveMaskedAttribute
ENDC
    ld hl, wDirtyRows
    ld d, 0
    ld e, c
    add hl, de
    ld a, [hl]
    or b
    ld [hl], a
.unchanged:
    pop bc
    pop de
    pop hl
    ret

ClearScreen:
IF SCENE_ENABLED
    call SceneReset
ENDC
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    cp 8
    ret nc
    ld [wTextPalette], a
IF SCREEN_IMAGE_ENABLED
    call RestoreImageGraphics
ENDC
IF MASKED_ENABLED
    call ResetMasked
ENDC
    call ResetCamera
    ld hl, wBGTiles
    ld bc, BG_BUFFER_BYTES
.tiles:
IF MASKED_ENABLED
    ld a, 128
ELSE
    xor a
ENDC
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
IF MASKED_FILL_ENABLED
    call SaveMaskedAttributes
ENDC
    ld hl, wDirtyRows
    ld b, BG_BUFFER_ROWS
IF MASKED_ENABLED && COLOR_ENABLED
    ld a, 15
ELSE
    ld a, 3
ENDC
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
IF PALETTE_LITERALS_BANKED
    push af
    push hl
    push de
    ld bc, BANK(PaletteLiterals)
    call SelectROMBank
    pop de
    pop hl
    pop af
ENDC
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
IF MASKED_FILL_ENABLED
    call SyncMaskedPalettes
ENDC
    ret

; Copy a 32-tile row into an invisible map, avoiding mode 3.
CopyVRAMRow:
IF MASKED_ENABLED && COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .cpu
    ldh a, [$FF40]
    bit 7, a
    jr z, .cpu
    ; Pattern composition/upload has finished. Its temporary cartridge RAM
    ; can now stage an aligned row for HBlank DMA into the hidden map.
    push de
    xor a
    ld [$4000], a
    ld a, $0A
    ld [$0000], a
    ld de, $A000
    ld bc, 32
    call CopyArray
    pop de
    ld a, $A0
    ldh [$FF51], a
    xor a
    ldh [$FF52], a
    ld a, d
    and $1F
    ldh [$FF53], a
    ld a, e
    ldh [$FF54], a
IF SCENE_ENABLED
    ; HDMA stalls can delay the fixed-HUD raster interrupt. Keep both blocks
    ; clear of its boundary; otherwise one scene scanline uses the HUD SCX.
.rasterSafe:
    ld a, [wSceneActive]
    and a
    jr z, .startDMA
    ldh a, [$FF44]
    cp SCENE_HUD_ROWS * 8 - 3
    jr c, .startDMA
    cp SCENE_HUD_ROWS * 8
    jr c, .rasterSafe
.startDMA:
ENDC
    ld a, $81
    ldh [$FF55], a
.dmaWait:
    ldh a, [$FF55]
    bit 7, a
    jr z, .dmaWait
    xor a
    ld [$0000], a
    ld a, e
    add 32
    ld e, a
    ret nc
    inc d
    ret
.cpu:
ENDC
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
    inc hl
    inc de
    ld a, [hli]
.secondByte:
    ld [de], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    inc de
    dec b
    dec b
    jr nz, .copy
    ret

RefreshScreen:
IF MASKED_ENABLED
    call ComposeMasked
ENDC
IF SCREEN_IMAGE_ENABLED
    ld a, [wImageActive]
    cp 2
    jp z, PresentImage
ENDC
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
IF MASKED_ENABLED
    push hl
    ld hl, wDirtyRows
    ld a, [wFlushRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [wFlushMask]
    add a
    add a
    and [hl]
    pop hl
    jr z, .attributesDone
ENDC
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
IF MASKED_ENABLED && COLOR_ENABLED
    ld b, a
    add a
    add a
    or b
ENDC
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
IF SCENE_ENABLED
    ld a, [wSceneActive]
    and a
    jr z, .scenePaletteDone
    ld a, [wSceneDmgPalette]
    ldh [$FF47], a
.scenePaletteDone:
ENDC
IF SCREEN_IMAGE_ENABLED
    ld a, [wImageActive]
    and a
    jr z, .imagePaletteDone
    ld a, [wImageDmgPalette]
    ldh [$FF47], a
.imagePaletteDone:
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
IF CPU_DOUBLE_SPEED
    ld b, 64
.bgPaletteCopy:
    ld a, [hli]
    ldh [$FF69], a
    dec b
    jr nz, .bgPaletteCopy
ELSE
    REPT 64
        ld a, [hli]
        ldh [$FF69], a
    ENDR
ENDC
    ld a, $80
    ldh [$FF6A], a
    ld hl, wOBJPalettes
IF CPU_DOUBLE_SPEED
    ld b, 64
.objPaletteCopy:
    ld a, [hli]
    ldh [$FF6B], a
    dec b
    jr nz, .objPaletteCopy
ELSE
    REPT 64
        ld a, [hli]
        ldh [$FF6B], a
    ENDR
ENDC
.palettesDone:
ENDC
    ld a, [wOAMDirty]
    and a
    jr z, .oamDone
    ld a, HIGH(wShadowOAM)
    call hOAMDMA
.oamDone:
IF MASKED_TINT_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .tintSizeDone
    ldh a, [$FF40]
    or 6
    ldh [$FF40], a
.tintSizeDone:
ENDC
    ld a, [wMapPending]
    and a
    jr z, .flipDone
    ldh a, [$FF40]
    xor 8
IF MASKED_ENABLED
    ld b, a
    ld a, [wMaskedPending]
    and a
    ld a, b
    jr z, .maskedFlipDone
    xor 16
.maskedFlipDone:
ENDC
    ldh [$FF40], a
    ld a, [wFrontMap]
    xor 1
    ld [wFrontMap], a
.flipDone:
IF MASKED_ENABLED
    ld a, [wMaskedPending]
    and a
    jr z, .maskedDone
    ld a, [wMaskedFront]
    xor 1
    ld [wMaskedFront], a
    xor a
    ld [wMaskedPending], a
.maskedDone:
ENDC
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
IF SCENE_ENABLED
    ld a, [wSceneFineNext]
    ld [wSceneFine], a
ENDC
    ld a, [wCameraY]
    ldh [$FF42], a
    xor a
    ld [wCameraDirty], a
    ld [wPaletteDirty], a
    ld [wOAMDirty], a
IF ACTOR_ENABLED
    ld [wActorPending], a
ENDC
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
