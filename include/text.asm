; Startup and text routines. Interrupts remain disabled in this first runtime.
; Preserve boot A long enough to detect CGB hardware ($11).
InitDisplay:
    cp $11
    ld b, 0
    jr nz, .hardwareKnown
    inc b
.hardwareKnown:
    xor a
IF COLOR_ENABLED
    ld a, b
ENDC
    ld [wIsCGB], a
    ld a, [$FF40]
    bit 7, a
    jr z, .disableLCD
.wait:
    ld a, [$FF44]
    cp 144
    jr c, .wait
.disableLCD:
    xor a
    ld [$FF40], a
    ld [$FF42], a
    ld [$FF43], a
    ld hl, $FE00
    ld b, 160
.clearOAM:
    ld [hli], a
    dec b
    jr nz, .clearOAM
    ld hl, DMARoutine
    ld de, hOAMDMA
    ld b, DMARoutineEnd - DMARoutine
.installDMA:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .installDMA
IF COLOR_ENABLED
    ld a, [wIsCGB]
    and a
    jr z, .dmg
    ; Clear CGB background attributes in VRAM bank 1.
    ld a, 1
    ld [$FF70], a
    ld [$FF4F], a
    call ClearMap
    xor a
    ld [$FF4F], a
    ; Palette 0: white, light gray, dark gray, black.
    ld a, $80
    ld [$FF68], a
    ld hl, ColorPalette
    ld b, 8
.palette:
    ld a, [hli]
    ld [$FF69], a
    dec b
    jr nz, .palette
.dmg:
ENDC
    ld a, $E4
    ld [$FF47], a
    ld [$FF48], a
    ld [$FF49], a
    ld bc, BANK(Font)
    call SelectROMBank
    ld hl, Font
    ld de, $8000
    ld bc, FontEnd - Font
.font:
    ld a, [hli]
    ld [de], a
    inc de
    dec bc
    ld a, b
    or c
    jr nz, .font
    call ClearMap
    ld a, $93
    ld [$FF40], a
    ret

ClearMap:
    ld hl, $9800
    ld bc, 2048
.loop:
    xor a
    ld [hli], a
    dec bc
    ld a, b
    or c
    jr nz, .loop
    ret

IF COLOR_ENABLED
ColorPalette:
    dw $7FFF, $56B5, $294A, $0000
ENDC
