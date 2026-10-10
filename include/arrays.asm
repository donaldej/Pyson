; HL: signed index, DE: fixed array length, BC: base address.
; Return HL: element address. Normalize Python negative indices, then check bounds.
ArrayIndexAddress:
    bit 7, h
    jr z, .check
    add hl, de
.check:
    ld a, h
    cp d
    jr c, .valid
    jp nz, ArrayIndexError
    ld a, l
    cp e
    jp nc, ArrayIndexError
.valid:
    add hl, hl
    add hl, bc
    ret

; Copy BC nonzero bytes of initializer data from ROM HL into WRAM DE.
CopyArray:
    ld a, [hli]
    ld [de], a
    inc de
    dec bc
    ld a, b
    or c
    jr nz, CopyArray
    ret

; BC=$ffff identifies RAM; other values are ROM banks, including ROM0.
ReadArrayParameterWord:
    bit 7, b
    jr z, ReadConstantTableWord
    ld a, [hli]
    ld h, [hl]
    ld l, a
    ret

; HL: checked ROM element address; BC: table bank. Return signed word in HL.
; Run entirely in ROM0 and restore the caller's bank before returning to ROMX.
ReadConstantTableWord:
    call SelectROMBank
    ld a, [hli]
    ld e, a
    ld a, [hl]
    ld h, a
    ld l, e
IF CODE_BANKING_ENABLED
    jp RestoreExecutionBank
ELSE
    ret
ENDC
