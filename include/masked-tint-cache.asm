; Three exact-key entries per layer in volatile SRAM banks 1/2/3. Bank 0 remains
; the compositor/ownership workspace. Each 2KB entry contains up to 40 patterns,
; OAM, a collision-free 70-byte key and the resulting scanline budget.
; All routines run on the existing private WRAM bank-2 stack.
TintCacheFrame:
    ld a, [wTintTagReady]
    and a
    call z, TintCacheClearTags
    ld hl, $D800
    ld b, 40
    xor a
.clear:
    ld [hli], a
    dec b
    jr nz, .clear
    ret

TintCacheClearTags:
    ld hl, $D700
    ld b, 240
    ld a, $FF
.clear:
    ld [hli], a
    dec b
    jr nz, .clear
    ld a, 1
    ld [wTintTagReady], a
    ret

; HL source, DE destination, BC nonzero length. SRAM is selected by caller.
TintCacheCopy:
    ld a, [hli]
    ld [de], a
    inc de
    dec bc
    ld a, b
    or c
    jr nz, TintCacheCopy
    ret

; A way (0/1/2). Return entry's SRAM base in HL and select its SRAM bank.
TintCacheSelect:
    ld b, a
    inc a
    ld [wTintCacheBank], a
    ld [$4000], a
    ld a, [wTintLayerIndex]
    ld e, a
    add a
    add e
    add b
    ld [wTintCacheEntry], a
    ld a, [wTintLayerIndex]
    REPT 3
        add a
    ENDR
    add $A0
    ld h, a
    ld l, 0
    ld [wTintCacheBase + 1], a
    xor a
    ld [wTintCacheBase], a
    ret

TintCacheAddress:
    ld a, [wTintCacheBase]
    ld l, a
    ld a, [wTintCacheBase + 1]
    ld h, a
    add hl, bc
    ret

TintCacheLookup:
    ld a, [wTintCount]
    ld [wTintCacheStart], a
    ld a, 1
    ld [wTintCacheMode], a
    call TintCacheMoving
    ; Own and front actor descriptors determine every owned pixel. Lower
    ; layers cannot change it, so their descriptor bytes are deliberately zero.
    ld hl, $D600
    ld b, 56
    xor a
.zero:
    ld [hli], a
    dec b
    jr nz, .zero
    ld a, [wTintLayerIndex]
    add a
    ld b, a
    REPT 3
        add a
    ENDR
    sub b
    ld l, a
    ld h, 0
    ld b, h
    ld c, l
    ld de, wMaskedActors
    add hl, de
    push hl
    ld hl, $D600
    add hl, bc
    ld d, h
    ld e, l
    ld a, 56
    sub c
    ld c, a
    ld b, 0
    pop hl
    call TintCacheCopy
    ld hl, wTintPalettes
    ld de, $D638
    ld bc, 4
    call TintCacheCopy
    ld a, [wTintCount]
    ld [$D63C], a
    ld hl, wTintScan
    ld de, $D63D
    ld bc, 9
    call TintCacheCopy
    xor a
    call TintCacheTryWay
    jr c, .hit
    ld a, 1
    call TintCacheTryWay
    jr c, .hit
    ld a, 2
    call TintCacheTryWay
    jr c, .hit
    xor a
    ld [$4000], a
    ld hl, wTintCacheMisses
    inc [hl]
    jr nz, .miss
    inc hl
    inc [hl]
.miss:
    and a
    ret
.hit:
    ld a, 2
    ld [wTintCacheMode], a
    call TintCacheLoad
    ld hl, wTintCacheHits
    inc [hl]
    jr nz, .done
    inc hl
    inc [hl]
.done:
    xor a
    ld [$4000], a
    scf
    ret

TintCacheTryWay:
    call TintCacheSelect
    ld a, [wTintCacheEntry]
    ld e, a
    ld d, 0
    ld hl, wTintCacheValid
    add hl, de
    ld a, [hl]
    and a
    ret z
    ld bc, $5A0
    call TintCacheAddress
    ld de, $D600
    ld b, 70
.compare:
    ld a, [de]
    cp [hl]
    jr nz, .miss
    inc de
    inc hl
    dec b
    jr nz, .compare
    scf
    ret
.miss:
    and a
    ret

; Streaming new positions rarely recur within the three-entry working set.
; Still try existing entries, but avoid copying a one-use miss into SRAM.
TintCacheMoving:
    ld a, [wTintLayerIndex]
    ld e, a
    ld d, 0
    ld hl, wTintCachePositionValid
    add hl, de
    ld b, [hl]
    ld [hl], 1
    push bc
    ld a, e
    add a
    add a
    ld e, a
    ld hl, wTintCacheLastXY
    add hl, de
    push hl
    ld a, [wTintLayerIndex]
    add a
    ld b, a
    REPT 3
        add a
    ENDR
    sub b
    add 7
    ld e, a
    ld d, 0
    ld hl, wMaskedActors
    add hl, de
    pop de
    ld b, 4
    ld c, 0
.byte:
    ld a, [de]
    cp [hl]
    jr z, .same
    inc c
.same:
    ld a, [hli]
    ld [de], a
    inc de
    dec b
    jr nz, .byte
    ld a, c
    pop bc
    and a
    ret z
    ld a, b
    and a
    ret z
    ld a, 3
    ld [wTintCacheMode], a
    ret

; Match/update residency for current global slot, cache entry/generation/local.
; A miss sets that slot's dirty byte. Tags live outside the staging patterns.
TintCacheTag:
    ld a, [wTintCount]
    ld e, a
    add a
    add e
    ld l, a
    ld h, $D7
    ld a, [wTintBase]
    and a
    jr z, .pointer
    ld de, 120
    add hl, de
.pointer:
    push hl
    ld a, [wTintCacheEntry]
    ld e, a
    ld d, 0
    ld hl, wTintCacheGeneration
    add hl, de
    ld b, [hl]
    pop hl
    inc a
    ld c, a
    cp [hl]
    jr nz, .dirty
    inc hl
    ld a, b
    cp [hl]
    jr nz, .backOne
    inc hl
    ld a, [wTintCacheLocal]
    cp [hl]
    ret z
    dec hl
.backOne:
    dec hl
.dirty:
    ld a, c
    ld [hli], a
    ld a, b
    ld [hli], a
    ld a, [wTintCacheLocal]
    ld [hl], a
    ld a, [wTintCount]
    ld l, a
    ld h, $D8
    ld [hl], 1
    scf
    ret

TintCacheStage:
    ld a, [wTintCount]
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld de, $D000
    add hl, de
    ret

TintCacheLoad:
    ld bc, $5F0
    call TintCacheAddress
    ld a, [hli]
    ld [wTintCacheLength], a
    ld de, wTintScan
    ld bc, 9
    push hl
    call TintCacheCopy
    pop hl
IF SCENE_ENABLED
    ld bc, 9
    add hl, bc
    ld a, [hl]
    ld [$D646], a
ENDC
    xor a
    ld [wTintCacheLocal], a
    ld bc, 0
    call TintCacheAddress
    ld a, l
    ld [wTintCacheRead], a
    ld a, h
    ld [wTintCacheRead + 1], a
.loop:
    ld a, [wTintCacheLength]
    ld b, a
    ld a, [wTintCacheLocal]
    cp b
    jp z, TintCacheTouch
    call TintCacheTag
    jr nc, .resident
    call TintCacheStage
    ld d, h
    ld e, l
    ld a, [wTintCacheRead]
    ld l, a
    ld a, [wTintCacheRead + 1]
    ld h, a
    ld bc, 32
    call TintCacheCopy
.resident:
    ld hl, wTintCacheRead
    ld a, [hl]
    add 32
    ld [hli], a
    ld a, [hl]
    adc 0
    ld [hl], a
    ; Copy cached position/attribute, rebase tile index to the hidden pool.
    ld a, [wTintCacheLocal]
    add a
    add a
    ld c, a
    ld b, 5
    call TintCacheAddress
    push hl
    ld a, [wTintCount]
    add a
    add a
    ld l, a
    ld h, 0
    ld de, wShadowOAM
    add hl, de
    ld d, h
    ld e, l
    pop hl
    ld a, [hli]
    ld [de], a
    inc de
    ld a, [hli]
IF SCENE_ENABLED
    ; Actor descriptors use tile-map coordinates, including fine scroll.
    ; The same cached patterns can therefore occur at a different screen X.
    ; Rebase the cached OAM X as well as its tile index.
    ld b, a
    ld a, [$D646]
    add b
    ld b, a
    ld a, [wSceneFineNext]
    ld c, a
    ld a, b
    sub c
ENDC
    ld [de], a
    inc de
    inc hl
    ld a, [wTintBase]
    ld b, a
    ld a, [wTintCount]
    add a
    add b
    ld [de], a
    inc de
    ld a, [hl]
    ld [de], a
    ld hl, wTintCount
    inc [hl]
    ld hl, wTintCacheLocal
    inc [hl]
    jp .loop

TintCacheTouch:
    ld a, [wTintLayerIndex]
    ld e, a
    ld d, 0
    ld hl, wTintCacheNext
    add hl, de
    ld a, [wTintCacheBank]
    cp 3
    jr c, .ready
    xor a
.ready:
    ld [hl], a
    ret

TintCacheFinish:
    ld a, [wTintCacheMode]
    cp 3
    jp z, TintCacheUncached
    cp 1
    ret nz
    ld a, [wTintCount]
    ld b, a
    ld a, [wTintCacheStart]
    ld c, a
    ld a, b
    sub c
    ld [wTintCacheLength], a
    ld a, [wTintLayerIndex]
    ld e, a
    ld d, 0
    ld hl, wTintCacheNext
    add hl, de
    ld a, [hl]
    call TintCacheSelect
    ld a, [wTintCacheEntry]
    ld e, a
    ld d, 0
    ld hl, wTintCacheGeneration
    add hl, de
    inc [hl]
    call z, TintCacheClearTags
    ld a, [wTintCacheStart]
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld de, $D000
    add hl, de
    push hl
    ld bc, 0
    call TintCacheAddress
    ld d, h
    ld e, l
    pop hl
    ld a, [wTintCacheLength]
    and a
    jr z, .metadata
    ld c, a
    ld b, 0
    REPT 5
        sla c
        rl b
    ENDR
    call TintCacheCopy
    ld a, [wTintCacheStart]
    add a
    add a
    ld l, a
    ld h, 0
    ld de, wShadowOAM
    add hl, de
    push hl
    ld bc, $500
    call TintCacheAddress
    ld d, h
    ld e, l
    pop hl
    ld a, [wTintCacheLength]
    add a
    add a
    ld c, a
    ld b, 0
    call TintCacheCopy
.metadata:
    ld bc, $5A0
    call TintCacheAddress
    ld d, h
    ld e, l
    ld hl, $D600
    ld bc, 70
    call TintCacheCopy
    ld bc, $5F0
    call TintCacheAddress
    ld a, [wTintCacheLength]
    ld [hli], a
    ld d, h
    ld e, l
    ld hl, wTintScan
    ld bc, 9
    call TintCacheCopy
IF SCENE_ENABLED
    ld a, [wSceneFineNext]
    ld [de], a
ENDC
    ld a, [wTintCacheEntry]
    ld e, a
    ld d, 0
    ld hl, wTintCacheValid
    add hl, de
    ld [hl], 1
    ld a, [wTintCacheStart]
    ld [wTintCount], a
    xor a
    ld [wTintCacheLocal], a
.tag:
    ld a, [wTintCacheLength]
    ld b, a
    ld a, [wTintCacheLocal]
    cp b
    jr z, .done
    call TintCacheTag
    ld hl, wTintCount
    inc [hl]
    ld hl, wTintCacheLocal
    inc [hl]
    jr .tag
.done:
    call TintCacheTouch
    xor a
    ld [$4000], a
    ret

TintCacheUncached:
    ld a, [wTintCacheStart]
    ld e, a
.loop:
    ld a, [wTintCount]
    cp e
    ret z
    ld l, e
    ld h, $D8
    ld [hl], 1
    ld a, e
    add a
    add e
    ld l, a
    ld h, $D7
    ld a, [wTintBase]
    and a
    jr z, .tag
    ld bc, 120
    add hl, bc
.tag:
    ld [hl], $FF
    inc e
    jr .loop

; Coalesce only dirty contiguous sprite-pattern runs into HBlank DMA uploads.
TintCacheUpload:
    xor a
    ld [wTintUploadSlot], a
    ld a, 1
    ldh [$FF4F], a
.find:
    ld a, [wTintCount]
    ld b, a
    ld a, [wTintUploadSlot]
    cp b
    jp nc, .done
    ld l, a
    ld h, $D8
    ld a, [hl]
    and a
    jr nz, .run
    ld hl, wTintUploadSlot
    inc [hl]
    jr .find
.run:
    ld a, [wTintUploadSlot]
    ld c, a
.extend:
    inc c
    ld a, [wTintCount]
    cp c
    jr z, .ready
    ld l, c
    ld h, $D8
    ld a, [hl]
    and a
    jr nz, .extend
.ready:
    ld a, c
    ld [wTintUploadEnd], a
    ld a, [wTintUploadSlot]
    ld l, a
    ld h, 0
    REPT 5
        add hl, hl
    ENDR
    ld a, h
    add $D0
    ldh [$FF51], a
    ld a, l
    ldh [$FF52], a
    ldh [$FF54], a
    ld a, [wTintBase]
    and a
    ld a, h
    jr z, .destination
    add 5
.destination:
    ldh [$FF53], a
    ld a, [wTintUploadSlot]
    ld b, a
    ld a, [wTintUploadEnd]
    sub b
    add a
    ld b, a
    ld hl, wTintUploadBlocks
    add [hl]
    ld [hli], a
    jr nc, .counted
    inc [hl]
.counted:
    ld a, b
    dec a
    or $80
    ldh [$FF55], a
.wait:
    call TintSyncAudio
    ldh a, [$FF55]
    bit 7, a
    jr z, .wait
    ld a, [wTintUploadEnd]
    ld [wTintUploadSlot], a
    jp .find
.done:
    xor a
    ldh [$FF4F], a
    ret
