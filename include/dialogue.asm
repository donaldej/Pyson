; One active dialogue, using the bottom 48 pixels of the window. Interior:
; columns 1..18, rows 1..4. Text uses ROM0 glyph IDs, 254 newline, 255 end.
StartDialogue:
    ld a, [wArg1 + 1]
    ld b, a
    ld a, [wArg2 + 1]
    or b
    ret nz
    ld a, [wArg2]
    cp 8
    ret nc
IF CHOICES_ENABLED
    xor a
    ld [wChoicesMode], a
    ld [wChoicesCancelled], a
    ld a, [wArg2]
ENDC
    ld [wDialoguePalette], a
    ld a, [wArg1]
    ld [wDialogueSpeed], a
    ld a, [wArg0]
    ld [wDialoguePointer], a
    ld a, [wArg0 + 1]
    ld [wDialoguePointer + 1], a
IF FORMAT_ENABLED
    ld a, [wDialoguePointer]
    cp LOW(wFormatBuffer)
    jr nz, .staticText
    ld a, [wDialoguePointer + 1]
    cp HIGH(wFormatBuffer)
    jr nz, .staticText
    ld hl, wFormatBuffer
    ld de, wDialogueSnapshot
    ld bc, 256
    call CopyArray
    ld a, LOW(wDialogueSnapshot)
    ld [wDialoguePointer], a
    ld a, HIGH(wDialogueSnapshot)
    ld [wDialoguePointer + 1], a
.staticText:
ENDC
DialogueOpenFrame:
    xor a
    ld [wDialogueFinished], a
    ld [wDialogueFast], a
IF PORTRAIT_ENABLED
    ld [wPortraitEnabled], a
    ld a, 1
    ld [wDialogueLeft], a
    xor a
ENDC
    ld [wWindowX], a
    ld a, 96
    ld [wWindowY], a
    ld a, 1
    ld [wWindowControlDirty], a
    ld [wDialogueActive], a
    ld [wDialogueJustStarted], a
    ld a, [wDialoguePalette]
    ld [wTextPalette], a
    ; Replace the six visible rows, leaving unrelated hidden window rows alone.
    ; Draw the border once. Subsequent pages only clear the interior.
    ld b, 0
.horizontal:
    ld c, 0
    ld a, DIALOGUE_HORIZONTAL_TILE
    call SetWindowCell
    ld c, 5
    ld a, DIALOGUE_HORIZONTAL_TILE
    call SetWindowCell
    inc b
    ld a, b
    cp 20
    jr nz, .horizontal
    ld c, 1
.vertical:
    ld b, 0
    ld a, DIALOGUE_VERTICAL_TILE
    call SetWindowCell
    ld b, 19
    ld a, DIALOGUE_VERTICAL_TILE
    call SetWindowCell
    inc c
    ld a, c
    cp 5
    jr nz, .vertical
    ld b, 0
    ld c, 0
    ld a, DIALOGUE_CORNER_TILE
    call SetWindowCell
    ld b, 19
    ld a, DIALOGUE_CORNER_TILE
    call SetWindowCell
    ld c, 5
    ld a, DIALOGUE_CORNER_TILE
    call SetWindowCell
    ld b, 0
    ld a, DIALOGUE_CORNER_TILE
    call SetWindowCell
    call DialoguePreparePage
    jp ShowWindow

CloseDialogue:
IF CHOICES_ENABLED
    ld a, [wChoicesMode]
    and a
    jr z, .normal
    ld a, [wDialogueActive]
    and a
    jp nz, ChoicesCancel
    xor a
    ld [wChoicesMode], a
    ld [wChoicesCancelled], a
.normal:
ENDC
    xor a
    ld [wDialogueActive], a
    ld [wDialogueWaiting], a
    ld [wDialogueFinished], a
    jp HideWindow

DialoguePreparePage:
    xor a
    ld [wDialogueWaiting], a
    ld [wDialogueCounter], a
    ld [wDialogueFast], a
    ld a, 1
    ld [wDialogueX], a
IF PORTRAIT_ENABLED
    ld a, [wDialogueLeft]
    ld [wDialogueX], a
    ld a, 1
ENDC
    ld [wDialogueY], a
    ld [wDialogueWordStart], a
    ld c, 1
.row:
    ld b, 1
.cell:
    ld a, DIALOGUE_SPACE_TILE
    call SetWindowCell
    inc b
    ld a, b
    cp 19
    jr nz, .cell
    inc c
    ld a, c
    cp 5
    jr nz, .row
    ld b, 18
    ld c, 5
    ld a, DIALOGUE_HORIZONTAL_TILE
    call SetWindowCell
IF PORTRAIT_ENABLED
    call DrawDialoguePortrait
ENDC
    ret

DialogueAwait:
    ld a, 1
    ld [wDialogueWaiting], a
    ld b, 18
    ld c, 5
    ld a, DIALOGUE_MORE_TILE
    jp SetWindowCell

DialogueNextLine:
IF PORTRAIT_ENABLED
    ld a, [wDialogueLeft]
ELSE
    ld a, 1
ENDC
    ld [wDialogueX], a
    ld [wDialogueWordStart], a
    ld a, [wDialogueY]
    cp 4
    jp z, DialogueAwait
    inc a
    ld [wDialogueY], a
    ret

UpdateDialogue:
    ld a, [wDialogueActive]
    and a
    ret z
    ld a, [wDialoguePalette]
    ld [wTextPalette], a
IF CHOICES_ENABLED
    ld a, [wChoicesMode]
    and a
    jp nz, UpdateChoices
ENDC
    ld a, [wDialogueJustStarted]
    and a
    jr z, .input
    xor a
    ld [wDialogueJustStarted], a
    jr .typing ; The button opening a dialogue cannot also advance it.
.input:
    ld a, [wButtonsPressed]
    and $90 ; A or Start, using an edge rather than a held button.
    ld b, a
    ld a, [wDialogueWaiting]
    and a
    jr z, .reveal
    ld a, b
    and a
    ret z
    ld a, [wDialoguePointer]
    ld l, a
    ld a, [wDialoguePointer + 1]
    ld h, a
    ld a, [hl]
    cp 255
    jp nz, DialoguePreparePage
    xor a
    ld [wDialogueActive], a
    ld [wDialogueWaiting], a
    inc a
    ld [wDialogueFinished], a
    jp HideWindow
.reveal:
    ld a, b
    and a
    jr z, .typing
    ld a, 1
    ld [wDialogueFast], a
.typing:
    ld a, [wDialogueWaiting]
    and a
    ret nz
    ld a, [wDialogueSpeed]
    and a
    jr z, .emit
    ld a, [wDialogueFast]
    and a
    jr nz, .emit
    ld a, [wDialogueCounter]
    and a
    jr z, .emit
    dec a
    ld [wDialogueCounter], a
    ret
.emit:
    call DialogueStep
    ld a, [wDialogueWaiting]
    and a
    ret nz
    ld a, [wDialogueFast]
    and a
    jr nz, .emit
    ld a, [wDialogueSpeed]
    and a
    jr z, .emit
    dec a
    ld [wDialogueCounter], a
    ret

; Consume commands/spaces and draw at most one glyph. Leave the first glyph
; of the next page unconsumed when the four-line page runs out of room.
DialogueStep:
.next:
    ld a, [wDialoguePointer]
    ld l, a
    ld a, [wDialoguePointer + 1]
    ld h, a
    ld a, [hl]
    cp 255
    jp z, DialogueAwait
    cp 254
    jr z, .newline
    cp DIALOGUE_SPACE_TILE
    jr nz, .word
    ld a, 1
    ld [wDialogueWordStart], a
    ld a, [wDialogueX]
IF PORTRAIT_ENABLED
    ld d, a
    ld a, [wDialogueLeft]
    cp d
ELSE
    cp 1
ENDC
    jr z, .skipSpace
    ld a, [wDialogueX]
    cp 19
    jr nc, .skipSpace
    jr .write
.skipSpace:
    inc hl
    call DialogueSavePointer
    jr .next
.newline:
    inc hl
    call DialogueSavePointer
    call DialogueNextLine
    ld a, [wDialogueWaiting]
    and a
    ret nz
    jr .next
.word:
    ld a, [wDialogueX]
    cp 19
    jr c, .lookahead
    call DialogueNextLine
    ld a, [wDialogueWaiting]
    and a
    ret nz
.lookahead:
    ld a, [wDialogueWordStart]
    and a
    jr z, .write
    push hl
    ld b, 0
.scan:
    ld a, [hli]
    cp 255
    jr z, .measured
    cp 254
    jr z, .measured
    cp DIALOGUE_SPACE_TILE
    jr z, .measured
    inc b
    ld a, b
    cp 19
    jr c, .scan
.measured:
    pop hl
    ld a, [wDialogueX]
IF PORTRAIT_ENABLED
    ld d, a
    ld a, [wDialogueLeft]
    cp d
ELSE
    cp 1
ENDC
    jr z, .write
    ld a, [wDialogueX]
    add b
    cp 20
    jr c, .write
    call DialogueNextLine
    ld a, [wDialogueWaiting]
    and a
    ret nz
.write:
    ld a, [hl]
    push af
    inc hl
    call DialogueSavePointer
    ld a, [wDialogueX]
    ld b, a
    ld a, [wDialogueY]
    ld c, a
    pop af
    call SetWindowCell
    ld a, [wCellTile]
    cp DIALOGUE_SPACE_TILE
    ld a, 0
    jr nz, .wordState
    inc a
.wordState:
    ld [wDialogueWordStart], a
    ld a, [wDialogueX]
    inc a
    ld [wDialogueX], a
    ld a, [hl]
    cp 255
    jp z, DialogueAwait
    ret

DialogueSavePointer:
    ld a, l
    ld [wDialoguePointer], a
    ld a, h
    ld [wDialoguePointer + 1], a
    ret
