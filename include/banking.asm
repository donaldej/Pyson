; BC selects the switchable ROM bank. Preserve all input registers.
; This routine executes from ROM0 even when its caller is in switchable ROM.
SelectROMBank:
    push af
IF CARTRIDGE_CONTROLLER == 1
    xor a
    ld [$6000], a ; MBC1 simple mode keeps ROM0 permanently mapped.
    ld a, c
    and $1F
    ld [$2000], a
    ld a, c
    rrca
    rrca
    rrca
    rrca
    rrca
    and 3
    ld [$4000], a
ELIF CARTRIDGE_CONTROLLER == 3
    ld a, c
    ld [$2000], a
ELIF CARTRIDGE_CONTROLLER == 5
    ld a, c
    ld [$2000], a
    ld a, b
    and 1
    ld [$3000], a
ENDC
    pop af
    ret

IF CODE_BANKING_ENABLED
; BC target bank, HL target address. Parameters already live in static WRAM.
; Save the execution bank on the CPU stack to support nested calls.
CallBankedFunction:
    ld a, [wExecutionBank]
    ld e, a
    ld a, [wExecutionBank + 1]
    ld d, a
    push de
    ld a, c
    ld [wExecutionBank], a
    ld a, b
    ld [wExecutionBank + 1], a
    call SelectROMBank
    ld de, .returned
    push de
    jp hl
.returned:
    pop bc
    ld a, c
    ld [wExecutionBank], a
    ld a, b
    ld [wExecutionBank + 1], a
    jp RestoreExecutionBank

; Preserve runtime results, including compare flags and register arguments.
; Execution bank zero means main is executing in permanently mapped ROM0.
RestoreExecutionBank:
    push af
    push bc
    ld a, [wExecutionBank]
    ld c, a
    ld a, [wExecutionBank + 1]
    ld b, a
    or c
    jr z, .done
    call SelectROMBank
.done:
    pop bc
    pop af
    ret
ENDC
