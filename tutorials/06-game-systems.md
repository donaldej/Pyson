# 6. Audio, conversations, and saves

Goal: add feedback, conversations, and persistent state while keeping each
system's update and ownership rules clear.

## Step 1: control music without restarting every update

Build [Music Gallery](../examples/music-gallery/main.pysn):

```powershell
npm.cmd run build -- examples/music-gallery/main.pysn music-gallery
```

A selects a looping melody, B a one-shot, Start pauses/resumes, and Select stops.
Up/Down trigger effects. Compare the looping and one-shot definitions: each note
contains frequency, duration ticks, and volume. Selecting an already active
track normally preserves its position; `restart=True` deliberately resets it.

Music uses channel 1 pulse and optionally channel 3 wave; effects use channel 2
or 4. You can combine them without composing an audio register driver. For a
two-voice imported composition, follow `lead`/`bass` in
[Feature Lab](../examples/feature-lab/main.pysn).
Tick timing is cooperative by default; lesson 7 introduces display-frame timing.

## Step 2: keep a conversation alive across updates

Build [Dialogue Garden](../examples/dialogue-garden/main.pysn):

```powershell
npm.cmd run build -- examples/dialogue-garden/main.pysn dialogue-garden
```

The initial conversation starts automatically. A talks, B closes, and Select
changes text speed; follow the displayed menu instructions when choices appear.
Read [message data](../examples/dialogue-garden/includes/messages.pysn), then
find `talk`, `update_dialogue`, and choice handling in main.

Start dialogue on an event, not unconditionally in every update. Continue
updating it while active and draw/refresh the resulting frame. Completion and
choice results belong in game state so the game can respond on later updates.
Dialogue owns window presentation while it is active; coordinate it with HUDs.
Dialogue Garden's `open_message(text, delay=2)` helper accepts either imported
message directly. [Lesson 10](10-text-helpers.md) explains reusable string parameters.

## Step 3: define save ownership

Build [Save Counter](../examples/save-counter/main.pysn):

```powershell
npm.cmd run build -- examples/save-counter/main.pysn save-counter
```

Use the on-screen controls to change/save the score, then close and reopen the
emulator using its normal battery-save workflow. Verify the score persists.
The first lines define slot 0 as a schema version and reserve other slots for
score, best, mute, and volume. They validate loaded values before using them.

`save_read(slot, default)` supplies a fallback for absent/invalid data.
`save_write` commits and verifies an integer value. Helpers in different modules
need agreed slot ranges; importing a module does not create its own save space.
Do not call `save_clear()` on every startup or every screen transition.

The example may reset data when its schema does not match. Experiment with a
separate ROM/save name and never delete someone else's save to test migration.

## Try it

In a copied Music Gallery, double one note's duration; listen for the longer
note. In a copied Dialogue Garden, change a message and verify its wrapping.
Finally verify a saved score survives restart, rather than only surviving a
screen transition. These are three distinct kinds of state lifetime.

References: [music](../documentation/music.md), [effects](../documentation/sound.md),
[dialogue](../documentation/dialogue.md), [choices](../documentation/choices.md),
[saves](../documentation/save.md).

[Previous](05-actors-pools.md) · [Next: timing and performance](07-performance.md)
