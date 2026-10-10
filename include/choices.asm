; Choice tables live in ROM0: count byte followed by immutable label pointers.
; wArg0 table, wArg1 palette, wArg2 selected palette, wArg3 default, wArg4 cancel.
StartChoices:
    ld a, [wArg1 + 1]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ld b, a
    ld a, [wArg3 + 1]
    or b
    ret nz
    ld a, [wArg1]
    cp 8
    ret nc
    ld a, [wArg2]
    cp 8
    ret nc
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    ld a, [hl]
    ld b, a
    ld a, [wArg3]
    cp b
    ret nc
    ld [wChoicesSelected], a
    ld a, b
    ld [wChoicesCount], a
    ld a, l
    ld [wChoicesTable], a
    ld a, h
    ld [wChoicesTable + 1], a
    ld a, [wArg1]
    ld [wDialoguePalette], a
    ld a, [wArg2]
    ld [wChoicesSelectedPalette], a
    ld a, [wArg4]
    ld b, a
    ld a, [wArg4 + 1]
    or b
    ld a, 0
    jr z, .cancelFlag
    inc a
.cancelFlag:
    ld [wChoicesCancelAllowed], a
    xor a
    ld [wChoicesCancelled], a
    ld a, 255
    ld [wChoicesResult], a
    ld a, 1
    ld [wChoicesMode], a
    call DialogueOpenFrame
    ld a, 1
    ld [wDialogueWaiting], a
    jp DrawChoices

DrawChoices:
    xor a
    ld [wChoicesRow], a
.row:
    ld a, [wChoicesRow]
    ld b, a
    ld a, [wChoicesSelected]
    cp b
    jr nz, .unselected
    ld a, [wChoicesSelectedPalette]
    ld [wTextPalette], a
    ld d, DIALOGUE_MORE_TILE
    jr .cursor
.unselected:
    ld a, [wDialoguePalette]
    ld [wTextPalette], a
    ld d, DIALOGUE_SPACE_TILE
.cursor:
    ld a, b
    inc a
    ld c, a
    ld b, 1
    ld a, d
    call SetWindowCell
    ; Look up this row's label, then fill its remaining cells with spaces.
    ld a, [wChoicesRow]
    ld l, a
    ld h, 0
    add hl, hl
    inc hl
    ld a, [wChoicesTable]
    ld e, a
    ld a, [wChoicesTable + 1]
    ld d, a
    add hl, de
    ld a, [hli]
    ld e, a
    ld d, [hl]
    ld h, d
    ld l, e
    ld b, 2
.label:
    ld a, [hli]
    cp 255
    jr z, .padding
    call SetWindowCell
    inc b
    jr .label
.padding:
    ld a, DIALOGUE_SPACE_TILE
    call SetWindowCell
    inc b
    ld a, b
    cp 19
    jr nz, .padding
    ld a, [wChoicesRow]
    inc a
    ld [wChoicesRow], a
    ld b, a
    ld a, [wChoicesCount]
    cp b
    jp nz, .row
    ret

UpdateChoices:
    ld a, [wDialogueJustStarted]
    and a
    jr z, .input
    xor a
    ld [wDialogueJustStarted], a
    ret
.input:
    ld a, [wButtonsPressed]
    bit 5, a ; B cancels only when permitted.
    jr z, .navigate
    ld a, [wChoicesCancelAllowed]
    and a
    jp nz, ChoicesCancel
.navigate:
    ld a, [wButtonsPressed]
    and $0c
    cp 4
    jr z, .up
    cp 8
    jr nz, .confirm
    ld a, [wChoicesSelected]
    inc a
    ld b, a
    ld a, [wChoicesCount]
    cp b
    ld a, b
    jr nz, .changed
    xor a
    jr .changed
.up:
    ld a, [wChoicesSelected]
    and a
    jr nz, .decrement
    ld a, [wChoicesCount]
.decrement:
    dec a
.changed:
    ld [wChoicesSelected], a
    call DrawChoices
.confirm:
    ld a, [wButtonsPressed]
    and $90
    ret z
    ld a, [wChoicesSelected]
    ld [wChoicesResult], a
    xor a
    ld [wDialogueActive], a
    ld [wDialogueWaiting], a
    inc a
    ld [wDialogueFinished], a
    jp HideWindow

ChoicesCancel:
    xor a
    ld [wDialogueActive], a
    ld [wDialogueWaiting], a
    ld [wDialogueFinished], a
    ld a, 255
    ld [wChoicesResult], a
    ld a, 1
    ld [wChoicesCancelled], a
    jp HideWindow

ChoicesActive:
    ld a, [wChoicesMode]
    and a
    jr z, ChoicesFalse
    ld a, [wDialogueActive]
    jr ChoicesBoolean
ChoicesFinished:
    ld a, [wChoicesMode]
    and a
    jr z, ChoicesFalse
    ld a, [wDialogueFinished]
    jr ChoicesBoolean
ChoicesCancelled:
    ld a, [wChoicesMode]
    and a
    jr z, ChoicesFalse
    ld a, [wChoicesCancelled]
ChoicesBoolean:
    ld l, a
    ld h, 0
    ret
ChoicesFalse:
    ld hl, 0
    ret

ChoicesResult:
    ld a, [wChoicesMode]
    and a
    jr z, ChoicesNone
    ld a, [wChoicesResult]
    cp 255
    jr z, ChoicesNone
    jr ChoicesBoolean
ChoicesSelected:
    ld a, [wChoicesMode]
    and a
    jr z, ChoicesNone
    ld a, [wChoicesSelected]
    jr ChoicesBoolean
ChoicesNone:
    ld hl, $ffff
    ret
