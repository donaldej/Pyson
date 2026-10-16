# Pyson feature reference

New to Pyson? Follow the [tutorial learning path](../tutorials/README.md) for
explained, runnable examples. This directory provides precise API contracts,
limits, and implementation behavior. The [project README](../README.md) has
the development setup and compiler overview.

AI coding agents can start with the self-contained
[AI reference manual](../AI_REFERENCE.md). Its complete programs are compiled and
assembled in the test suite, and its API catalog is checked against the compiler.

## Getting started

- [Windows setup and commands](development.md)
- [Reading memory and graphics build reports](build-reports.md)
- [ROM header configuration](header.md)
- [Text drawing](print.md)
- [Buttons and the basic loop](input.md)

## Language and state

- [Variables and operators](variables.md)
- [Fractional numbers and movement](fixed-point.md)
- [Conditions and loops](control-flow.md)
- [Functions, defaults, and keywords](functions.md)
- [Named arguments and public built-in parameter names](arguments.md)
- [Modules, shared state, and scratch conventions](modules.md)
- [Math helpers and constants](math.md)
- [Mutable integer arrays](arrays.md)
- [Immutable ROM tables](constant-tables.md)
- [Passing arrays and ROM tables to functions: plain-language examples](constant-tables.md#passing-tables-to-functions)
- [Records and record arrays](records.md)
- [Object pools and safe handles](pools.md)

## Graphics and presentation

- [Graphics, palettes, and sprites](graphics.md)
- [BMP formats and conversion](assets.md)
- [Runtime tile fields and grids](tile-fields.md)
- [Animated backgrounds and frame sheets](background-clips.md)
- [Nested tile maps and terrain](tilemaps.md)
- [Editable maps](mutable-maps.md)
- [Scrolling and cameras](scrolling.md)
- [Larger streamed worlds](worlds.md)
- [Fixed window HUDs](window.md)
- [Sprite animation](animation.md)
- [Movement vs. sprite animation vs. prepared motion tables](motion-tables.md)
- [Dialogue and portraits](dialogue.md)
- [Choices and conversation branching](choices.md)

## Gameplay systems

- [Map collision and tile queries](collision.md)
- [Rectangle hitboxes](rectangles.md)
- [Swept movement helpers](movement.md)
- [Seeded randomness](random.md)
- [Battery-backed save slots](save.md)

## Timing and audio

- [Hardware frame timing and elapsed movement](frame-timing.md)
- [Background music and imported compositions](music.md)
- [Sound effects and priorities](sound.md)

## Development tools and examples

- [ROM banking and capacity](banking.md)
- [Linked reports and runtime errors](diagnostics.md)
- [Text formatting, speakers, and portraits](dialogue.md#formatted-text-speakers-and-portraits)
- [Star Chase project walkthrough](star-chase.md)
- [Feature Lab combined example](feature-lab.md)

## Development notes

[Advanced rendering notes](advanced-rendering-notes.md) describe profiling,
historical observations, proposals, and a documentation backlog. They are not
a promise that every proposed rendering feature is implemented. For supported
APIs use the feature references above; for an agent handoff use
[CONTEXT.MF](../CONTEXT.MF).
