; Development toolchain fixture: a minimal ROM that idles after boot.
SECTION "Entry", ROM0[$0100]
    nop
    jp Start
    ds $0150 - @, 0

SECTION "Main", ROM0[$0150]
Start:
    di
    ld sp, $FFFE
.loop:
    jr .loop
