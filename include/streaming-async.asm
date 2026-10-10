; Cooperative prefetch. Work is bounded per refresh, with no frame waits in
; the pump. STAT guards allow short writes in HBlank as well as VBlank.

; HL new camera, DE previous request -> A direction (-1/0/1).
; Mark large changes as jumps before restricting the displayed camera.
StreamRequestDirection:
    push hl
    ld a, [de]
    ld c, a
    inc de
    ld a, [de]
    ld b, a
    ld a, l
    sub c
    ld l, a
    ld a, h
    sbc b
    ld h, a
    ld a, h
    or l
    jr z, .zero
    bit 7, h
    jr nz, .negative
    ld a, h
    and a
    jr nz, .jumpPositive
    ld a, l
    cp 9
    jr nc, .jumpPositive
    ld a, 1
    jr .done
.negative:
    ld a, h
    cp 255
    jr nz, .jumpNegative
    ld a, l
    cp 248
    jr c, .jumpNegative
    ld a, 255
    jr .done
.jumpNegative:
    ld a, 1
    ld [wStreamJump], a
    ld a, 255
    jr .done
.jumpPositive:
    ld a, 1
    ld [wStreamJump], a
    jr .done
.zero:
    xor a
.done:
    pop hl
    ret

StreamPlanCamera:
    ld a, [wCameraX]
    ld l, a
    ld a, [wCameraX + 1]
    ld h, a
    ld de, wStreamWantedX
    call StreamRequestDirection
    ld [wStreamMoveX], a
    ld a, l
    ld [wStreamWantedX], a
    ld a, h
    ld [wStreamWantedX + 1], a
    ld a, [wCameraY]
    ld l, a
    ld a, [wCameraY + 1]
    ld h, a
    ld de, wStreamWantedY
    call StreamRequestDirection
    ld [wStreamMoveY], a
    ld a, l
    ld [wStreamWantedY], a
    ld a, h
    ld [wStreamWantedY + 1], a
    ld a, [wStreamRegionX]
    cp 255
    ret z
    ld a, [wStreamJump]
    and a
    ret nz
    ; Adopt a completed neighbor before sprite positions use the camera.
    ld a, [wStreamPhase]
    cp 2
    jr nz, .limit
    ld hl, wStreamWantedX
    call StreamCameraRegion
    ld c, a
    ld a, [wStreamRegionX]
    ld b, a
    ld a, c
    call StreamClampNeighbor
    ld b, a
    ld a, [wStreamTargetX]
    cp b
    jr nz, .limit
    ld hl, wStreamWantedY
    call StreamCameraRegion
    ld c, a
    ld a, [wStreamRegionY]
    ld b, a
    ld a, c
    call StreamClampNeighbor
    ld b, a
    ld a, [wStreamTargetY]
    cp b
    jr nz, .limit
    ld a, [wStreamTargetX]
    ld [wStreamRegionX], a
    ld a, [wStreamTargetY]
    ld [wStreamRegionY], a
    xor a
    ld [wStreamPhase], a
.limit:
    ld a, [wStreamRegionX]
    ld hl, wCameraX
    call StreamLimitAxis
    ld a, [wStreamRegionY]
    ld hl, wCameraY
    jp StreamLimitAxis

; A ready region index, HL queued camera word. Safe window [region*32-8,+40].
StreamLimitAxis:
    push hl
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld bc, 40
    add hl, bc
    ld d, h
    ld e, l
    pop hl
    push hl
    ld a, [hli]
    ld h, [hl]
    ld l, a
    call ClampStreamCamera
    ; HL <= maximum. Minimum is maximum - 48, clamped to zero.
    ld a, e
    sub 48
    ld e, a
    ld a, d
    sbc 0
    ld d, a
    jr c, .store
    ld a, h
    cp d
    jr c, .minimum
    jr nz, .store
    ld a, l
    cp e
    jr nc, .store
.minimum:
    ld h, d
    ld l, e
.store:
    ld b, h
    ld c, l
    pop hl
    ld [hl], c
    inc hl
    ld [hl], b
    ret

StreamRefreshLive:
    ; Requests outside the ready window take priority over prediction.
    ld a, [wStreamRegionX]
    ld b, a
    ld a, [wStreamNextX]
    cp b
    jr nz, .requested
    ld a, [wStreamRegionY]
    ld b, a
    ld a, [wStreamNextY]
    cp b
    jr nz, .requested
    ; Predict the neighboring region in the current movement direction.
    ld a, [wStreamMoveX]
    ld b, a
    ld a, [wStreamRegionX]
    add b
    ld b, a
    ld a, [wStreamWorldRegionColumns]
    cp b
    jr z, .sameX
    jr c, .sameX
    ld a, b
    cp 255
    jr nz, .storeX
.sameX:
    ld a, [wStreamRegionX]
.storeX:
    ld [wStreamNextX], a
    ld a, [wStreamMoveY]
    ld b, a
    ld a, [wStreamRegionY]
    add b
    ld b, a
    ld a, [wStreamWorldRegionRows]
    cp b
    jr z, .sameY
    jr c, .sameY
    ld a, b
    cp 255
    jr nz, .storeY
.sameY:
    ld a, [wStreamRegionY]
.storeY:
    ld [wStreamNextY], a
.requested:
    ; If fast movement outruns loading, catch up one safe neighbor at a time.
    ld a, [wStreamRegionX]
    ld b, a
    ld a, [wStreamNextX]
    call StreamClampNeighbor
    ld [wStreamNextX], a
    ld a, [wStreamRegionY]
    ld b, a
    ld a, [wStreamNextY]
    call StreamClampNeighbor
    ld [wStreamNextY], a
    ld a, [wStreamNextX]
    ld b, a
    ld a, [wStreamRegionX]
    cp b
    jr nz, .target
    ld a, [wStreamNextY]
    ld b, a
    ld a, [wStreamRegionY]
    cp b
    jr z, .commit
.target:
    ld a, [wStreamPhase]
    and a
    jr z, .start
    ld a, [wStreamTargetX]
    ld b, a
    ld a, [wStreamNextX]
    cp b
    jr nz, .start
    ld a, [wStreamTargetY]
    ld b, a
    ld a, [wStreamNextY]
    cp b
    jr z, .commit
.start:
    call StreamPrepareRegion
    ld a, [wStreamNextX]
    ld [wStreamTargetX], a
    add a
    add a
    dec a
    and 31
    ld [wStreamOriginX], a
    ld a, [wStreamNextY]
    ld [wStreamTargetY], a
    add a
    add a
    dec a
    and 31
    ld [wStreamOriginY], a
    ld a, [wStreamRegionX]
    ld b, a
    ld a, [wStreamTargetX]
    sub b
    ld c, 26
    call StreamOverlap
    ld [wStreamOverlapLeft], a
    ld a, c
    ld [wStreamOverlapRight], a
    ld a, [wStreamRegionY]
    ld b, a
    ld a, [wStreamTargetY]
    sub b
    ld c, 24
    call StreamOverlap
    ld [wStreamOverlapTop], a
    ld a, c
    ld [wStreamOverlapBottom], a
    xor a
    ld [wStreamScan], a
    ld [wStreamScan + 1], a
    ld [wStreamMapReady], a
    ld a, 1
    ld [wStreamPhase], a
.commit:
    xor a
    ld [wStreamLCDPaused], a
IF WINDOW_ENABLED
    call RefreshWithWindow
ELSE
    call StreamFlushBackgroundEdits
    call WaitVBlank
    ldh a, [$FF40]
    res 3, a
    ldh [$FF40], a
    call CommitGraphicsFrame
ENDC
    ld a, [wStreamPhase]
    cp 1
    jr nz, .done
    call StreamPumpTiles
    call StreamPumpMap
    ld a, [wStreamTileCount]
    and a
    jr nz, .done
    ld a, [wStreamMapReady]
    and a
    jr z, .done
    ld a, 2
    ld [wStreamPhase], a
.done:
    scf
    ret

; A target-relative region delta, C extent -> overlap starts at A, ends before C.
StreamOverlap:
    and a
    ret z
    bit 7, a
    jr nz, .negative
    dec c
    dec c
    dec c
    dec c
    xor a
    ret
.negative:
    ld a, 4
    ret

; A wanted region, B ready region -> nearest neighbor on the path to A.
StreamClampNeighbor:
    ld c, a
    sub b
    cp 2
    jr c, .original
    cp 255
    jr z, .original
    bit 7, a
    ld a, b
    jr nz, .left
    inc a
    ret
.left:
    dec a
    ret
.original:
    ld a, c
    ret

IF !WINDOW_ENABLED
; Keep the streaming background at $9800. User drawing retains its ordinary
; dirty-row behavior; prefetch writes do not mark rows dirty or flip maps.
StreamFlushBackgroundEdits:
    xor a
    ld [wFlushRow], a
    ld [wMapPending], a
    ld [wFrontMap], a
    ld a, $98
    ld [wFlushBase], a
.row:
    ld hl, wDirtyRows
    ld a, [wFlushRow]
    ld e, a
    ld d, 0
    add hl, de
    ld a, [hl]
    and a
    jr z, .next
    xor a
    ld [hl], a
    call FlushRowPointers
    ld bc, wBGTiles
    add hl, bc
    call CopyVRAMRow
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .next
    ld a, 1
    ldh [$FF4F], a
    call FlushRowPointers
    ld bc, wBGAttrs
    add hl, bc
    call CopyVRAMRow
    xor a
    ldh [$FF4F], a
ENDC
.next:
    ld a, [wFlushRow]
    inc a
    ld [wFlushRow], a
    cp 32
    jr c, .row
    ret
ENDC

; HL tile source, DE VRAM destination, plus cached tile ID and next list pointer.
StreamReadTileRecord:
    ld a, [wStreamTileBank]
    ld c, a
    ld a, [wStreamTileBank + 1]
    ld b, a
    call SelectROMBank
    ld a, [wStreamTilePointer]
    ld l, a
    ld a, [wStreamTilePointer + 1]
    ld h, a
    ld a, [hli]
    ld [wStreamSlot], a
    ld e, a
    ld d, 0
    REPT 4
        sla e
        rl d
    ENDR
    ld a, d
    add $80
    ld d, a
    push de
    ld a, [hli]
    ld [wStreamTileID], a
    ld a, [hli]
    ld [wStreamTileID + 1], a
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, [hli]
    ld c, a
    ld a, [hli]
    ld b, a
    ld a, l
    ld [wStreamTileNext], a
    ld a, h
    ld [wStreamTileNext + 1], a
    push bc
    push de
    ld a, [wStreamSlot]
    sub STREAM_TILE_BASE
    ld l, a
    ld h, 0
    add hl, hl
    ld de, wStreamCache
    add hl, de
    ld a, l
    ld [wStreamCachePointer], a
    ld a, h
    ld [wStreamCachePointer + 1], a
    pop hl
    pop bc
    pop de
    call SelectROMBank
    ret

StreamTileCached:
    push hl
    ld a, [wStreamCachePointer]
    ld l, a
    ld a, [wStreamCachePointer + 1]
    ld h, a
    ld a, [wStreamTileID]
    cp [hl]
    jr nz, .missing
    inc hl
    ld a, [wStreamTileID + 1]
    cp [hl]
    jr nz, .missing
    pop hl
    and a
    ret
.missing:
    pop hl
    scf
    ret

StreamCacheTile:
    push hl
    ld a, [wStreamCachePointer]
    ld l, a
    ld a, [wStreamCachePointer + 1]
    ld h, a
    ld a, [wStreamTileID]
    ld [hli], a
    ld a, [wStreamTileID + 1]
    ld [hl], a
    pop hl
    ret

StreamAdvanceTile:
    ld a, [wStreamTileNext]
    ld [wStreamTilePointer], a
    ld a, [wStreamTileNext + 1]
    ld [wStreamTilePointer + 1], a
    ld a, [wStreamTileCount]
    dec a
    ld [wStreamTileCount], a
    ret

; C value, DE VRAM address. Protect the checked write when the clock is enabled.
StreamWriteAccessible:
.wait:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ldh a, [$FF41]
    and 2
    jr nz, .wait
.write:
    ld a, c
    ld [de], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

StreamPumpTiles:
    ld a, 4
    ld [wStreamUploadBudget], a
    ld a, 32
    ld [wStreamRecordBudget], a
.record:
    ld a, [wStreamTileCount]
    and a
    ret z
    ; Inspect IDs without selecting their graphics bank or preparing a copy.
    ld a, [wStreamTileBank]
    ld c, a
    ld a, [wStreamTileBank + 1]
    ld b, a
    call SelectROMBank
    ld a, [wStreamTilePointer]
    ld l, a
    ld a, [wStreamTilePointer + 1]
    ld h, a
    ld a, [hli]
    sub STREAM_TILE_BASE
    ld e, a
    ld d, 0
    sla e
    rl d
    push hl
    ld hl, wStreamCache
    add hl, de
    ld d, h
    ld e, l
    pop hl
    ld a, [hli]
    ld c, a
    ld a, [hli]
    ld b, a
    ld a, [de]
    cp c
    jr nz, .missing
    inc de
    ld a, [de]
    cp b
    jr nz, .missing
    ld bc, 4
    add hl, bc
    ld a, l
    ld [wStreamTileNext], a
    ld a, h
    ld [wStreamTileNext + 1], a
    jr .advance
.missing:
    ld a, [wStreamUploadBudget]
    and a
    ret z
    dec a
    ld [wStreamUploadBudget], a
    call StreamReadTileRecord
    ld b, 16
.byte:
    ld a, [hli]
    ld c, a
    call StreamWriteAccessible
    inc de
    dec b
    jr nz, .byte
    call StreamCacheTile
.advance:
    call StreamAdvanceTile
    ld a, [wStreamRecordBudget]
    dec a
    ld [wStreamRecordBudget], a
    jr nz, .record
    ret

; Read byte at scan row/column from a bank-local row dictionary. HL table base.
StreamReadScanCell:
    ld a, [wStreamScan]
    and 224
    ld c, a
    ld a, [wStreamScan + 1]
    ld b, a
    REPT 4
        srl b
        rr c
    ENDR
    add hl, bc
    ld a, [hli]
    ld h, [hl]
    ld l, a
    ld a, [wStreamScan]
    and 31
    ld c, a
    ld b, 0
    add hl, bc
    ld a, [hl]
    ret

StreamPumpMap:
    ld a, [wStreamMapReady]
    and a
    ret nz
    ld a, [wStreamMapBank]
    ld c, a
    ld a, [wStreamMapBank + 1]
    ld b, a
    call SelectROMBank
    ld a, 64 ; process incoming cells, jumping over shared rows/columns
    ld [wStreamScanBudget], a
.cell:
    ; The intersection already has the same immutable cells. Only incoming
    ; strips need dictionary reads and map writes; padding is never displayed.
    ld a, [wStreamScan]
    and 31
    cp 26
    jp nc, .nextRow
    ld c, a
    ld a, [wStreamScan]
    rlca
    rlca
    rlca
    and 7
    ld b, a
    ld a, [wStreamScan + 1]
    rlca
    rlca
    rlca
    or b
    cp 24
    jp nc, .complete
    ld b, a
    ld a, [wStreamOverlapLeft]
    cp c
    jr z, .checkRight
    jr nc, .read
.checkRight:
    ld a, [wStreamOverlapRight]
    cp c
    jr z, .read
    jr c, .read
    ld a, [wStreamOverlapTop]
    cp b
    jr z, .checkBottom
    jr nc, .read
.checkBottom:
    ld a, [wStreamOverlapBottom]
    cp b
    jp z, .read
    jp c, .read
    ; Jump over the entire shared interval rather than scanning each cell.
    ld a, [wStreamScan]
    and 224
    ld b, a
    ld a, [wStreamOverlapRight]
    or b
    ld [wStreamScan], a
    jp .cell
.read:
    ld a, [wStreamMapPointer]
    ld l, a
    ld a, [wStreamMapPointer + 1]
    ld h, a
    call StreamReadScanCell
    and a
    jp z, .next ; Padding must not erase the old viewport during prediction.
    ld [wStreamCellTile], a
    ld a, [wStreamPalette]
    cp 255
    jr nz, .palette
    ld a, [wStreamMapPointer]
    ld l, a
    ld a, [wStreamMapPointer + 1]
    ld h, a
    ld bc, 64
    add hl, bc
    call StreamReadScanCell
.palette:
    ld [wStreamCellPalette], a
    ; Compute the destination ring offset.
    ld a, [wStreamScan]
    and 31
    ld b, a
    ld a, [wStreamOriginX]
    add b
    and 31
    push af
    ld a, [wStreamScan]
    ld l, a
    ld a, [wStreamScan + 1]
    ld h, a
    REPT 5
        srl h
        rr l
    ENDR
    ld a, [wStreamOriginY]
    add l
    and 31
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    pop af
    ld c, a
    ld b, 0
    add hl, bc
    ld d, h
    ld e, l
    push de
    ld de, wBGTiles
    add hl, de
    pop de
    ld a, [wStreamCellTile]
    cp [hl]
    jr z, .attribute
    ld [hl], a
    ld c, a
    push de
    ld a, d
    add $98
    ld d, a
    call StreamWriteAccessible
    pop de
.attribute:
    ld bc, ATTR_OFFSET
    add hl, bc
    ld a, [wStreamCellPalette]
    cp [hl]
    jr z, .next
    ld [hl], a
IF COLOR_ENABLED
    ld c, a
    ld a, [wIsCGB]
    and a
    jr z, .next
    ld a, 1
    ldh [$FF4F], a
    ld a, d
    add $98
    ld d, a
    call StreamWriteAccessible
    xor a
    ldh [$FF4F], a
ENDC
.next:
    ld hl, wStreamScan
    inc [hl]
    jr nz, .budget
    inc hl
    inc [hl]
    ld a, [hl]
    cp 4
    jr nz, .budget
    ld a, 1
    ld [wStreamMapReady], a
    ret
.budget:
    ld a, [wStreamScanBudget]
    dec a
    ld [wStreamScanBudget], a
    jp nz, .cell
    ret
.nextRow:
    ld a, [wStreamScan]
    and 224
    add 32
    ld [wStreamScan], a
    jr nc, .rowAdvanced
    ld hl, wStreamScan + 1
    inc [hl]
.rowAdvanced:
    jp .cell
.complete:
    ld a, 1
    ld [wStreamMapReady], a
    ret
