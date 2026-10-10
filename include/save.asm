; Eight bytes per signed word: 'PY', version, value, inverted value, commit.
; All save code lives in ROM0. No RTC latch or rumble register bits are used.
InitSave:
    xor a
    ld [$0000], a
IF CARTRIDGE_CONTROLLER == 1
    ld [$6000], a
IF SAVE_RAM_BANKS > 1
    ld [$4000], a
ENDC
ELSE
    ld [$4000], a
ENDC
    ret

; HL slot -> HL record pointer. Carry means out of bounds; RAM stays disabled.
SaveOpen:
    ld a, h
    cp HIGH(SAVE_CAPACITY)
    jr nc, .invalid
    srl a
    srl a ; 1024 records per SRAM bank
IF CARTRIDGE_CONTROLLER == 1
IF SAVE_RAM_BANKS > 1
    ld [$4000], a
    ld a, 1
    ld [$6000], a ; <=512 KB ROM: upper register selects RAM only
ENDC
ELSE
    ld [$4000], a
ENDC
    ld a, h
    and 3
    ld h, a
    add hl, hl
    add hl, hl
    add hl, hl
    ld de, $A000
    add hl, de
    ld a, $0A
    ld [$0000], a
    and a
    ret
.invalid:
    scf
    ret

; Disable SRAM after every operation. Preserve registers and result flags.
SaveClose:
    push af
    xor a
    ld [$0000], a
IF CARTRIDGE_CONTROLLER == 1
IF SAVE_RAM_BANKS > 1
    ld [$6000], a
    ld [$4000], a
ENDC
ELSE
    ld [$4000], a
ENDC
    pop af
    ret

; HL record -> DE value, carry if blank, uncommitted, or damaged.
SaveValidate:
    ld a, [hli]
    cp $50
    jr nz, .invalid
    ld a, [hli]
    cp $59
    jr nz, .invalid
    ld a, [hli]
    cp 1
    jr nz, .invalid
    ld a, [hli]
    ld e, a
    ld a, [hli]
    ld d, a
    ld a, [hli]
    cpl
    cp e
    jr nz, .invalid
    ld a, [hli]
    cpl
    cp d
    jr nz, .invalid
    ld a, [hl]
    cp $A5
    jr nz, .invalid
    and a
    ret
.invalid:
    scf
    ret

SaveRead:
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call SaveOpen
    jr c, .default
    call SaveValidate
    call SaveClose
    jr c, .default
    ld h, d
    ld l, e
    ret
.default:
    ld a, [wArg1]
    ld l, a
    ld a, [wArg1 + 1]
    ld h, a
    ret

SaveExists:
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call SaveOpen
    jr c, .failed
    call SaveValidate
    call SaveClose
    ld hl, 0
    ret c
    inc l
    ret
.failed:
    ld hl, 0
    ret

SaveWrite:
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call SaveOpen
    jr c, .failed
    push hl
    push hl
    ld de, 7
    add hl, de
    xor a
    ld [hl], a ; invalidate before touching any payload
    pop hl
    ld a, $50
    ld [hli], a
    ld a, $59
    ld [hli], a
    ld a, 1
    ld [hli], a
    ld a, [wArg1]
    ld [hli], a
    ld e, a
    ld a, [wArg1 + 1]
    ld [hli], a
    ld d, a
    ld a, e
    cpl
    ld [hli], a
    ld a, d
    cpl
    ld [hli], a
    ld a, $A5
    ld [hl], a ; commit last
    pop hl
    call SaveValidate
    call SaveClose
    jr c, .failed
    ld a, [wArg1]
    cp e
    jr nz, .failed
    ld a, [wArg1 + 1]
    cp d
    jr nz, .failed
    ld hl, 1
    ret
.failed:
    ld hl, 0
    ret

SaveDelete:
    ld a, [wArg0]
    ld l, a
    ld a, [wArg0 + 1]
    ld h, a
    call SaveOpen
    jr c, .failed
    ld de, 7
    add hl, de
    xor a
    ld [hl], a
    ld a, [hl]
    and a
    call SaveClose
    jr nz, .failed
    ld hl, 1
    ret
.failed:
    ld hl, 0
    ret

; Invalidate every slot, preserving payload bytes for no purpose other than speed.
SaveClear:
    ld b, 0
.bank:
    push bc
    ld a, b
    add a
    add a
    ld h, a
    ld l, 0
    call SaveOpen
    ld de, 7
    add hl, de
    ld de, 1024
.record:
    xor a
    ld [hl], a
    ld a, l
    add 8
    ld l, a
    jr nc, .advanced
    inc h
.advanced:
    dec de
    ld a, d
    or e
    jr nz, .record
    call SaveClose
    pop bc
    inc b
    ld a, b
    cp SAVE_RAM_BANKS
    jr nz, .bank
    ld hl, 0
    ret
