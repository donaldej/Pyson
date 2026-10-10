; Full 32x32 hardware background maps allow smooth pixel scrolling.
; Camera coordinates are queued with graphics and applied by RefreshScreen.
ResetCamera:
    xor a
IF STREAM_ENABLED
    ld [wStreamActive], a
    ld [wStreamPhase], a
    ld [wCameraX + 1], a
    ld [wCameraY + 1], a
ENDC
    ld [wWorldActive], a
    ld [wCameraX], a
    ld [wCameraY], a
    ld a, 1
    ld [wCameraDirty], a
    ret

; Load an immutable world once. Same-handle calls preserve the camera/overlays.
DrawWorld:
    call QueryMapDescriptor
    ret c
    ld a, [wAssetCount]
IF STREAM_ENABLED
    cp 6
    jp z, DrawStreamWorld
ENDC
    cp 2
    jr z, .valid
    cp 4
    jr z, .valid
    cp 7
    ret nz
.valid:
    ld a, [wWorldActive]
    and a
    jr z, .load
    ld a, [wWorldMap]
    ld b, a
    ld a, [wArg0]
    cp b
    jr nz, .load
    ld a, [wAssetCount]
    cp 7
    ret nz
    jr .redraw
.load:
    ld a, [wArg0]
    ld [wWorldMap], a
    ld a, [wAssetCols]
    ld [wWorldCols], a
    ld a, [wAssetRows]
    ld [wWorldRows], a
    xor a
    ld [wArg0], a
    ld [wArg0 + 1], a
    call ClearScreen
.redraw:
    ld a, [wWorldMap]
    ld [wArg0], a
    xor a
    ld [wArg1], a
    ld [wArg1 + 1], a
    ld [wArg2], a
    ld [wArg2 + 1], a
    ld a, 1
    ld [wWorldDrawing], a
    call DrawMap
    xor a
    ld [wWorldDrawing], a
    ld a, 1
    ld [wWorldActive], a
    ret

; HL signed desired pixel coordinate, B maximum; returns clamped HL.
ClampCamera:
    bit 7, h
    jr nz, .zero
    ld a, h
    and a
    jr nz, .maximum
    ld a, l
    cp b
    ret c
.maximum:
    ld l, b
    ld h, 0
    ret
.zero:
    ld hl, 0
    ret

SetCamera:
IF STREAM_ENABLED
    ld a, [wStreamActive]
    and a
    jp nz, SetStreamCamera
ENDC
    ld a, [wWorldActive]
    and a
    ret z
    ld a, [wWorldCols]
    sub 20
    jr nc, .width
    xor a
.width:
    add a
    add a
    add a
    ld b, a
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call ClampCamera
    ld a, [wCameraX]
    cp l
    jr z, .vertical
    ld a, l
    ld [wCameraX], a
    ld a, 1
    ld [wCameraDirty], a
.vertical:
    ld a, [wWorldRows]
    sub 18
    jr nc, .height
    xor a
.height:
    add a
    add a
    add a
    ld b, a
    ld a, [wArg1]
    ld l, a
    ld a, [wArg1 + 1]
    ld h, a
    call ClampCamera
    ld a, [wCameraY]
    cp l
    ret z
    ld a, l
    ld [wCameraY], a
    ld a, 1
    ld [wCameraDirty], a
    ret

DrawWorldSprite:
    ld a, [wCameraX]
    ld b, a
    ld a, [wArg3]
    sub b
    ld [wArg3], a
IF STREAM_ENABLED
    ld a, [wCameraX + 1]
    ld b, a
    ld a, [wArg3 + 1]
    sbc b
ELSE
    ld a, [wArg3 + 1]
    sbc 0
ENDC
    ld [wArg3 + 1], a
    ld a, [wCameraY]
    ld b, a
    ld a, [wArg4]
    sub b
    ld [wArg4], a
IF STREAM_ENABLED
    ld a, [wCameraY + 1]
    ld b, a
    ld a, [wArg4 + 1]
    sbc b
ELSE
    ld a, [wArg4 + 1]
    sbc 0
ENDC
    ld [wArg4 + 1], a
    jp DrawSprite
