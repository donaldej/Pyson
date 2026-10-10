; Banked world metadata and overlapping working windows in the 32x32 ring.
StreamReadHeader:
    ld a, [wAssetBank]
    ld [wStreamHeaderBank], a
    ld a, [wAssetBank + 1]
    ld [wStreamHeaderBank + 1], a
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld a, [hli]
    ld [wAssetCols], a
    ld a, [hli]
    ld [wAssetRows], a
    ld a, [hli]
    ld [wStreamChunkColumns], a
    ld a, [hli]
    ld [wStreamRegionColumns], a
    inc hl
    inc hl
    ld a, [hli]
    ld [wStreamChunkTable], a
    ld a, [hli]
    ld [wStreamChunkTable + 1], a
    ld a, [hli]
    ld [wStreamRegionTable], a
    ld a, [hl]
    ld [wStreamRegionTable + 1], a
    ld a, 255
    ld [wStreamChunkIndex], a
    and a
    ret

; Called after coordinate bounds validation; returns a four-byte definition.
StreamCellAddress:
    ld a, [wArg2]
    rlca
    rlca
    rlca
    and 7
    ld b, a
    ld a, [wStreamChunkColumns]
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
    rlca
    rlca
    rlca
    and 7
    ld e, a
    add hl, de
    ld a, [wStreamChunkIndex]
    cp l
    jr z, .cached
    ld a, l
    ld [wStreamChunkIndex], a
    add hl, hl
    add hl, hl
    ld a, [wStreamChunkTable]
    ld e, a
    ld a, [wStreamChunkTable + 1]
    ld d, a
    add hl, de
    ld a, [wStreamHeaderBank]
    ld c, a
    ld a, [wStreamHeaderBank + 1]
    ld b, a
    call SelectROMBank
    call StreamSelectTableEntry
    ld a, c
    ld [wStreamChunkBank], a
    ld a, b
    ld [wStreamChunkBank + 1], a
    ld a, [hli]
    ld [wStreamChunkDefinitions], a
    ld a, [hli]
    ld [wStreamChunkDefinitions + 1], a
    ld a, l
    ld [wStreamChunkMap], a
    ld a, h
    ld [wStreamChunkMap + 1], a
.cached:
    ld a, [wStreamChunkBank]
    ld c, a
    ld a, [wStreamChunkBank + 1]
    ld b, a
    call SelectROMBank
    ld a, [wArg2]
    and 31
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld a, [wArg1]
    and 31
    ld e, a
    ld d, 0
    add hl, de
    ld a, [wStreamChunkMap]
    ld e, a
    ld a, [wStreamChunkMap + 1]
    ld d, a
    add hl, de
    ld l, [hl]
    ld h, 0
    add hl, hl
    add hl, hl
    ld a, [wStreamChunkDefinitions]
    ld e, a
    ld a, [wStreamChunkDefinitions + 1]
    ld d, a
    add hl, de
    and a
    ret

; HL points to address/bank tuple in the currently selected bank.
StreamSelectTableEntry:
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
    ret

DrawStreamWorld:
    ld a, [wStreamActive]
    and a
    jr z, .load
    ld a, [wWorldMap]
    ld b, a
    ld a, [wArg0]
    cp b
    ret z
.load:
    ld a, [wArg0]
    ld [wWorldMap], a
    ld a, [wAssetCols]
    ld [wWorldCols], a
    ld a, [wAssetRows]
    ld [wWorldRows], a
    ld a, [wStreamRegionColumns]
    ld [wStreamWorldRegionColumns], a
    ; The row count is the fifth header byte.
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld bc, 4
    add hl, bc
    ld a, [hl]
    ld [wStreamWorldRegionRows], a
    xor a
    ld [wArg0], a
    ld [wArg0 + 1], a
    call ClearScreen
    ld a, 1
    ld [wWorldActive], a
    ld [wStreamActive], a
    ld a, 255
    ld [wStreamRegionX], a
    ld [wStreamRegionY], a
    ld hl, wStreamCache
    ld bc, (256 - STREAM_TILE_BASE) * 2
.cache:
    ld [hli], a
    dec bc
    ld a, b
    or c
    ld a, 255
    jr nz, .cache
    xor a
    ld [wStreamWantedX], a
    ld [wStreamWantedX + 1], a
    ld [wStreamWantedY], a
    ld [wStreamWantedY + 1], a
    ret

; A tile dimension, BC screen size -> DE nonnegative maximum pixel coordinate.
StreamCameraMaximum:
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, hl
    ld a, l
    sub c
    ld e, a
    ld a, h
    sbc b
    ld d, a
    ret nc
    ld de, 0
    ret
; HL signed wanted coordinate, DE maximum -> clamped HL.
ClampStreamCamera:
    bit 7, h
    jr nz, .zero
    ld a, h
    cp d
    ret c
    jr nz, .maximum
    ld a, l
    cp e
    ret c
    ret z
.maximum:
    ld h, d
    ld l, e
    ret
.zero:
    ld hl, 0
    ret
SetStreamCamera:
    xor a
    ld [wStreamJump], a
    ld a, [wWorldCols]
    ld bc, 160
    call StreamCameraMaximum
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call ClampStreamCamera
    ld a, l
    ld [wCameraX], a
    ld a, h
    ld [wCameraX + 1], a
    ld a, [wWorldRows]
    ld bc, 144
    call StreamCameraMaximum
    ld a, [wArg1]
    ld l, a
    ld a, [wArg1 + 1]
    ld h, a
    call ClampStreamCamera
    ld a, l
    ld [wCameraY], a
    ld a, h
    ld [wCameraY + 1], a
    call StreamPlanCamera
    ld a, 1
    ld [wCameraDirty], a
    ret

; Read a camera word at HL and return its 32-pixel region index in A.
StreamCameraRegion:
    ld a, [hli]
    rlca
    rlca
    rlca
    and 7
    ld b, a
    ld a, [hl]
    add a
    add a
    add a
    or b
    ret

; Carry means a complete streamed frame was committed; otherwise use normal refresh.
TryRefreshStream:
    ld a, [wStreamActive]
    and a
    ret z
    ld hl, wStreamWantedX
    call StreamCameraRegion
    ld [wStreamNextX], a
    ld hl, wStreamWantedY
    call StreamCameraRegion
    ld [wStreamNextY], a
    ld b, a
    ld a, [wStreamRegionY]
    cp b
    jr nz, .changed
    ld a, [wStreamNextX]
    ld b, a
    ld a, [wStreamRegionX]
    cp b
    jr nz, .changed
    jp StreamRefreshLive
.changed:
    ld a, [wStreamRegionX]
    cp 255
    jr z, .load
    ld a, [wStreamJump]
    and a
    jr nz, .load
    jp StreamRefreshLive
.load:
.pause:
    ; Initial loads and jumps need not preserve the previous visible world.
    call WaitVBlank
    ldh a, [$FF40]
    res 7, a
    res 3, a
    ldh [$FF40], a
    ld a, 1
    ld [wStreamLCDPaused], a
    xor a
    ld [wStreamPhase], a
.prepare:
    call StreamPrepareRegion
    ld a, [wStreamTileBank]
    ld c, a
    ld a, [wStreamTileBank + 1]
    ld b, a
    call SelectROMBank
    call StreamUploadTiles
    jp StreamColdMap

; Read a region descriptor at NextX/Y. Shared by initial loads and prefetch.
StreamPrepareRegion:
    xor a
    ldh [$FF4F], a
    ld a, [wWorldMap]
    ld [wArg0], a
    xor a
    ld [wArg0 + 1], a
    call QueryMapDescriptor
    ld a, [wStreamNextY]
    ld b, a
    ld a, [wStreamRegionColumns]
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
    ld a, [wStreamNextX]
    ld e, a
    add hl, de
    add hl, hl
    add hl, hl
    ld a, [wStreamRegionTable]
    ld e, a
    ld a, [wStreamRegionTable + 1]
    ld d, a
    add hl, de
    call StreamSelectTableEntry
    ld a, [hli]
    ld [wStreamTileCount], a
    ld a, [hli]
    ld [wStreamPalette], a
    ld de, wStreamTilePointer
    ld b, 8
.descriptor:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .descriptor
    ret

StreamColdMap:
    ld a, [wStreamMapBank]
    ld c, a
    ld a, [wStreamMapBank + 1]
    ld b, a
    call SelectROMBank
    ld a, [wStreamMapPointer]
    ld e, a
    ld a, [wStreamMapPointer + 1]
    ld d, a
    ld a, [wStreamNextX]
    ld [wStreamRegionX], a
    add a
    add a
    dec a
    and 31
    ld [wStreamOriginX], a
    ld a, [wStreamNextY]
    ld [wStreamRegionY], a
    add a
    add a
    dec a
    and 31
    ld [wStreamOriginY], a
    ld hl, wBGTiles
    call StreamRotateBuffer
    ld a, [wStreamPalette]
    cp 255
    jr z, .mixed
    ld hl, wBGAttrs
    ld bc, 1024
.uniform:
    ld [hli], a
    dec bc
    push af
    ld a, b
    or c
    jr z, .uniformDone
    pop af
    jr .uniform
.uniformDone:
    pop af
    jr .flush
.mixed:
    ld hl, wBGAttrs
    call StreamRotateBuffer
.flush:
    ld hl, wBGTiles
    ld de, $9800
    ld bc, 1024
    call StreamUpdateBytes
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .attributesDone
    ld a, 1
    ldh [$FF4F], a
    ld hl, wBGAttrs
    ld de, $9800
    ld bc, 1024
    call StreamUpdateBytes
    xor a
    ldh [$FF4F], a
.attributesDone:
ENDC
    ld hl, wDirtyRows
    ld b, 32
    xor a
.clean:
    ld [hli], a
    dec b
    jr nz, .clean
    ld [wFrontMap], a
    ld [wMapPending], a
IF WINDOW_ENABLED
    ; Let the normal HUD path flush its dirty rows with the LCD enabled.
    ld a, [wStreamLCDPaused]
    and a
    jr z, .windowLive
    xor a
    ld [wWindowRow], a
.window:
    call FlushWindowRow
    ld a, [wWindowRow]
    inc a
    ld [wWindowRow], a
    cp 18
    jr c, .window
    call CommitWindowFrame
    jr .committed
.windowLive:
    call RefreshWithWindow
.committed:
ELSE
    ld a, [wStreamLCDPaused]
    and a
    call z, WaitVBlank
    call CommitGraphicsFrame
    ldh a, [$FF40]
    set 7, a
    ldh [$FF40], a
ENDC
    scf
    ret

; HL source, DE destination, BC byte count. Skip unchanged VRAM bytes.
StreamUpdateBytes:
    ld a, [hli]
    push bc
    ld c, a
    call StreamUpdateByte
    pop bc
    inc de
    dec bc
    ld a, b
    or c
    jr nz, StreamUpdateBytes
    ret

; C wanted byte, DE VRAM destination. Preserve all registers except AF.
StreamUpdateByte:
    ld a, [wStreamLCDPaused]
    and a
    jr nz, .write
.readable:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ldh a, [$FF41]
    and 2
    jr nz, .readable
    ld a, [de]
    cp c
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret z
    ; Leave the last VBlank scanline unused, including time for the call/return.
    ldh a, [$FF44]
    cp 144
    jr c, .wait
    cp 153
    jr c, .write
.wait:
    call WaitVBlank
.write:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ld a, c
    ld [de], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

; Full load: the display is disabled. Seed the slot cache for future batches.
StreamUploadTiles:
    call StreamReadTileRecord
    ld b, 16
.byte:
    ld a, [hli]
    ld c, a
    call StreamUpdateByte
    inc de
    dec b
    jr nz, .byte
    call StreamCacheTile
    call StreamAdvanceTile
    ret z
    jr StreamUploadTiles
    ret

; DE bank-local row pointer table, HL destination buffer. Rotate into ring coordinates.
; Returns DE immediately after the 32 row pointers (the next attribute table).
StreamRotateBuffer:
    ld a, l
    ld [wStreamCopyBase], a
    ld a, h
    ld [wStreamCopyBase + 1], a
    xor a
    ld [wStreamCopyRow], a
.row:
    ld a, [de]
    inc de
    ld l, a
    ld a, [de]
    inc de
    ld h, a
    ld a, e
    ld [wStreamCopyNext], a
    ld a, d
    ld [wStreamCopyNext + 1], a
    ld d, h
    ld e, l
    ld a, [wStreamCopyRow]
    ld b, a
    ld a, [wStreamOriginY]
    add b
    and 31
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld a, [wStreamCopyBase]
    ld c, a
    ld a, [wStreamCopyBase + 1]
    ld b, a
    add hl, bc
    ld a, [wStreamOriginX]
    ld c, a
    ld b, 0
    add hl, bc
    ld b, 32
.cell:
    ld a, [de]
    inc de
    ld [hli], a
    inc c
    ld a, c
    cp 32
    jr nz, .next
    ld c, 0
    push bc
    ld bc, -32
    add hl, bc
    pop bc
.next:
    dec b
    jr nz, .cell
    ld a, [wStreamCopyNext]
    ld e, a
    ld a, [wStreamCopyNext + 1]
    ld d, a
    ld a, [wStreamCopyRow]
    inc a
    ld [wStreamCopyRow], a
    cp 32
    jr c, .row
    ret
