; Full-screen still images temporarily own the pattern table. They are screen
; transitions, not animation layers. clear_screen restores the normal assets.
ShowImage:
    ld a, [wArg0 + 1]
    and a
    ret nz
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 10
    jr z, .kindOK
IF SCROLL_IMAGE_ENABLED
    cp 13
    ret nz
ELSE
    ret
ENDC
.kindOK:
    call ReadDescriptor
IF IMAGE_FAMILIES
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
    ld a, [hl]
    and a
    jr z, .fullImage
    ld b, a
    ld a, [wImageActive]
    cp 1
    jr nz, .fullImage
    ld a, [wImageFamily]
    cp b
    jr nz, .fullImage
IF SCENE_ENABLED
    ld a, [wSceneActive]
    and a
    jr nz, .fullImage
ENDC
    jp UpdateImageFamily
.fullImage:
ENDC
    ld a, [wImageActive]
    and a
    jr nz, .saved
    ldh a, [$FF47]
    ld [wImageSavedBGP], a
    ld hl, wBGPalettes
    ld de, wImageSavedPalette
IF MASKED_FILL_ENABLED && IMAGE_MULTIPALETTE
    ld bc, 8
    call SaveMaskedImagePalette
ELSE
    ld bc, IMAGE_PALETTE_BYTES
    call CopyImageData
ENDC
.saved:
    call ImageLCDOff
    ld a, 2
    ld [wImageActive], a
    call ImageInvalidate
    ld a, [wAssetMap]
    ld l, a
    ld a, [wAssetMap + 1]
    ld h, a
IF IMAGE_FAMILIES
    ld a, [hli]
    ld [wImageFamily], a
ENDC
    ld de, wBGPalettes
    ld bc, IMAGE_PALETTE_BYTES
    call CopyImageData
    ld a, [hli]
    ld [wImageDmgPalette], a
    ld a, [hli]
    ld c, a
    ld a, [hli]
    ld b, a
    ld de, $8000
    call CopyImageData
    ; Keep both hardware maps and their RAM shadow consistent, so subsequent
    ; palette-only refreshes cannot flip to an old scene.
    ld de, wBGTiles
    call ImageReadRows
IF IMAGE_MULTIPALETTE
    ; Tall scrolling assets place attributes after their complete map.
    ; ShowImage initially displays only the first eighteen rows.
    push hl
    ld a, [wAssetRows]
    sub 18
    ld l, a
    ld h, 0
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
    ld de, wBGAttrs
    call ImageReadRows
ELSE
    ld hl, wBGAttrs
    ld bc, BG_BUFFER_BYTES
    call ImageZero
ENDC
    ld hl, wDirtyRows
    ld bc, BG_BUFFER_ROWS
    call ImageZero
    call ImageCopyMaps
    ld a, 1
    ld [wPaletteDirty], a
    ; refresh_screen commits queued palette changes before enabling the LCD.
    ret

PresentImage:
    call CommitGraphicsFrame
    ld a, 1
    ld [wImageActive], a
    ld a, $91
    ldh [$FF40], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

RestoreImageGraphics:
    ld a, [wImageActive]
    and a
    ret z
    call ImageLCDOff
    call ImageInvalidate
    ld bc, BANK(Font)
    call SelectROMBank
    ld hl, Font
IF MASKED_ENABLED
    ld de, $8800
ELSE
    ld de, $8000
ENDC
    ld bc, FontEnd - Font
    call CopyImageData
    ld hl, wImageSavedPalette
    ld de, wBGPalettes
IF MASKED_FILL_ENABLED && IMAGE_MULTIPALETTE
    ld bc, 8
    call RestoreMaskedImagePalette
ELSE
    ld bc, IMAGE_PALETTE_BYTES
    call CopyImageData
ENDC
    ld a, [wImageSavedBGP]
    ldh [$FF47], a
    xor a
    ld [wImageActive], a
IF MASKED_ENABLED
    xor a
    ld [wMaskedFront], a
    ld [wMaskedPending], a
ENDC
    call ClearMap
    ld a, 1
    ld [wPaletteDirty], a
    call CommitGraphicsFrame
    ld a, $93
IF ACTOR_COMPONENT_HEIGHT == 16
    or 4
ENDC
    ldh [$FF40], a
IF FRAME_CLOCK_ENABLED
    ei
ENDC
    ret

; Stop the LCD only in VBlank. No pattern/map writes run against a live display.
ImageLCDOff:
IF FRAME_CLOCK_ENABLED
    di
ENDC
    ldh a, [$FF40]
    bit 7, a
    jr z, .off
.wait:
    call SampleImageInput
    ldh a, [$FF44]
    cp 144
    jr c, .wait
    ; LY becomes zero near the end of line153. Do not accept that final
    ; line: the display could restart between this read and the LCD write.
    cp 153
    jr nc, .wait
.off:
    xor a
    ldh [$FF40], a
    ldh [$FF4F], a
    ret

ImageZero:
    xor a
.loop:
    ld [hli], a
    dec bc
    call SampleImageInput
    ld a, b
    or c
    jr nz, ImageZero
    ret

ImageInvalidate:
IF SCROLL_IMAGE_ENABLED
    xor a
    ld [wScrollReady], a
ENDC
IF SCENE_ENABLED
    call SceneReset
ENDC
    xor a
    ld [wFrontMap], a
    ld [wMapPending], a
    ld [wCameraX], a
    ld [wCameraY], a
    ld [wCameraDirty], a
    ldh [$FF42], a
    ldh [$FF43], a
IF CLIP_ENABLED
    ld [wClipFront], a
    ld [wClipPending], a
    ld [wClipLastCols], a
    ld [wClipLastRows], a
ENDC
IF ACTOR_ENABLED
    ld [wActorPending], a
    ; An actor's cached picture is no longer in VRAM after the image upload.
    ; Clearing its state forces the next draw to upload even the same pose.
    ld hl, ActorStatePointers
    ld b, ACTOR_STATE_COUNT
.actor:
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    xor a
    ld [de], a
    dec b
    jr nz, .actor
ENDC
    ld hl, wShadowOAM
    ld bc, 160
    call ImageZero
    ld hl, wSpriteCounts
    ld bc, 40
    call ImageZero
    ld a, 1
    ld [wOAMDirty], a
    ret

ImageCopyMaps:
    ld hl, wBGTiles
    ld de, $9800
    ld bc, 18 * 32
    call CopyImageData
    ld hl, wBGTiles
    ld de, $9C00
    ld bc, 18 * 32
    call CopyImageData
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    ret z
    ld a, 1
    ldh [$FF4F], a
    ld hl, wBGAttrs
    ld de, $9800
    ld bc, 18 * 32
    call CopyImageData
    ld hl, wBGAttrs
    ld de, $9C00
    ld bc, 18 * 32
    call CopyImageData
    xor a
    ldh [$FF4F], a
ENDC
    ret

; LCD-off transfers do not generate VBlank interrupts. Keep sampling short
; presses explicitly while copying. Only the dedicated input bytes change.
SampleImageInput:
IF BUFFERED_BUTTONS_ENABLED
    push af
    ld a, c
    and 31
    jr nz, .done
    push bc
    push hl
    call SampleBufferedButtons
    pop hl
    pop bc
.done:
    pop af
ENDC
    ret

CopyImageData:
    ld a, [hli]
    ld [de], a
    inc de
    dec bc
    call SampleImageInput
    ld a, b
    or c
    jr nz, CopyImageData
    ret

; Copy a visible 20x18 plane into a padded 32-column RAM shadow. Tile IDs
; and color attributes use the same layout and input-sampling behavior.
ImageReadRows:
    ld b, 18
.row:
    push bc
    ld b, 20
.cell:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .cell
    ld b, 12
    xor a
.padding:
    ld [de], a
    inc de
    dec b
    jr nz, .padding
    pop bc
    call SampleImageInput
    dec b
    jr nz, .row
    ret

IF IMAGE_FAMILIES
; Compatible pictures use identical tile numbering and palette tables. Update
; their RAM map, then let refresh_screen atomically present the hidden map.
; The LCD and VBlank audio/input interrupts remain running.
UpdateImageFamily:
    push hl
    ld hl, wShadowOAM
    ld bc, 160
    call ImageZero
    ld hl, wSpriteCounts
    ld bc, 40
    call ImageZero
    ld a, 1
    ld [wOAMDirty], a
    pop hl
    inc hl
    ld de, wBGPalettes
    ld bc, IMAGE_PALETTE_BYTES
    call CopyImageData
    ld a, [hli]
    ld [wImageDmgPalette], a
    ld a, [hli]
    ld c, a
    ld a, [hli]
    ld b, a
    add hl, bc
    ld de, wBGTiles
    call ImageReadRows
IF IMAGE_MULTIPALETTE
    ld de, wBGAttrs
    call ImageReadRows
ENDC
    ld hl, wDirtyRows
    ld b, 18
.dirty:
    ld a, [hl]
IF MASKED_ENABLED && COLOR_ENABLED
    or 15
ELSE
    or 3
ENDC
    ld [hli], a
    dec b
    jr nz, .dirty
    ld a, 1
    ld [wPaletteDirty], a
    ret
ENDC
