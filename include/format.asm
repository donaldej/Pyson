FormatText:
    ld de, wFormatBuffer
    ld a, 255
    ld [wFormatRemaining], a
.next:
    ld a, [hli]
    cp 255
    jr z, FormatEnd
    cp 253
    jr z, .number
    call FormatAppend
    jr z, FormatEnd
    jr .next
.number:
    ld a, [hli]
    push hl
    push de
    add a
    ld l, a
    ld h, 0
    ld de, wArg1
    add hl, de
    ld a, [hli]
    ld h, [hl]
    ld l, a
    call IntToText
    pop de
.digits:
    ld a, [hli]
    cp 255
    jr z, .doneDigits
    call FormatAppend
    jr nz, .digits
    pop hl
    jr FormatEnd
.doneDigits:
    pop hl
    jr .next
FormatEnd:
    ld a, 255
    ld [de], a
    ld hl, wFormatBuffer
    ret
FormatAppend:
    ld [de], a
    inc de
    ld a, [wFormatRemaining]
    dec a
    ld [wFormatRemaining], a
    ret
