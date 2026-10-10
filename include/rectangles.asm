; Bias signed coordinates into unsigned 0..65535. Keep endpoint carry so
; positive-sized rectangles near 32767 do not wrap during comparison.
MACRO RectEndAfterStart
    ld a, [wRectArgs + \1]
    ld l, a
    ld a, [wRectArgs + \1 + 1]
    xor $80
    ld h, a
    ld a, [wRectArgs + \2]
    ld e, a
    ld a, [wRectArgs + \2 + 1]
    ld d, a
    add hl, de
    jr c, .after\@
    ld a, [wRectArgs + \3]
    ld e, a
    ld a, [wRectArgs + \3 + 1]
    xor $80
    ld d, a
    ld a, e
    sub l
    ld a, d
    sbc h
    jp nc, RectOverlapFalse
.after\@:
ENDM
RectOverlap:
    ld hl, wRectArgs + 4
    call RectPositiveSize
    jp z, RectOverlapFalse
    ld hl, wRectArgs + 6
    call RectPositiveSize
    jp z, RectOverlapFalse
    ld hl, wRectArgs + 12
    call RectPositiveSize
    jp z, RectOverlapFalse
    ld hl, wRectArgs + 14
    call RectPositiveSize
    jp z, RectOverlapFalse
    RectEndAfterStart 0, 4, 8
    RectEndAfterStart 8, 12, 0
    RectEndAfterStart 2, 6, 10
    RectEndAfterStart 10, 14, 2
    ld hl, 1
    ret
RectOverlapFalse:
    ld hl, 0
    ret
RectPositiveSize:
    ld a, [hli]
    ld b, a
    ld a, [hl]
    bit 7, a
    jr nz, .invalid
    or b
    ret
.invalid:
    xor a
    ret
