DialogueSpeaker:
    ld a, [wDialogueActive]
    and a
    ret z
    ld a, [wDialoguePalette]
    ld [wTextPalette], a
    ld b, 2
    ld c, 0
.next:
    ld a, [hli]
    cp 255
    jr z, .clear
    call SetWindowCell
    inc b
    jr .next
.clear:
    ld a, b
    cp 16
    ret z
    ld a, DIALOGUE_HORIZONTAL_TILE
    call SetWindowCell
    inc b
    jr .clear
DialoguePortrait:
    ld a, [wDialogueActive]
    and a
    ret z
IF CHOICES_ENABLED
    ld a, [wChoicesMode]
    and a
    ret nz
ENDC
    ld a, [wDialogueX]
    cp 1
    ret nz
    ld a, [wDialogueY]
    cp 1
    ret nz
    ld a, [wArg0 + 1]
    ld b, a
    ld a, [wArg1 + 1]
    or b
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret nz
    ld a, [wArg2]
    cp 8
    ret nc
    ld [wPortraitPalette], a
    ld a, [wArg0]
    call FindAsset
    ret c
    ld a, [hli]
    cp 1
    ret nz
    ld a, [hli]
    cp 2
    ret nz
    ld a, [hli]
    cp 2
    ret nz
    ld a, [hl]
    ld b, a
    ld a, [wArg1]
    cp b
    ret nc
    dec hl
    dec hl
    call ReadDescriptor
    ld a, [wAssetMap]
    ld e, a
    ld a, [wAssetMap + 1]
    ld d, a
    ld a, [wArg1]
    ld l, a
    ld h, 0
    add hl, hl
    add hl, hl
    add hl, de
    ld de, wPortraitTiles
    ld bc, 4
    call CopyArray
    ld a, 1
    ld [wPortraitEnabled], a
    ld a, 4
    ld [wDialogueLeft], a
    ld [wDialogueX], a
    jp DrawDialoguePortrait
DrawDialoguePortrait:
    ld a, [wPortraitEnabled]
    and a
    ret z
    ld a, [wPortraitPalette]
    ld [wTextPalette], a
    ld hl, wPortraitTiles
    ld b, 1
    ld c, 1
    ld a, [hli]
    call SetWindowCell
    inc b
    ld a, [hli]
    call SetWindowCell
    ld b, 1
    inc c
    ld a, [hli]
    call SetWindowCell
    inc b
    ld a, [hl]
    call SetWindowCell
    ld a, [wDialoguePalette]
    ld [wTextPalette], a
    ret
