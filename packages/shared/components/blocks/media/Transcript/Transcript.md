# Transcript

A scrolling, clickable transcript that follows a media player: it tracks the
player's position, and clicking a line seeks the player to it.

Attributes are generated from the schema and shown on this block's Overview tab.

## It follows; it does not drive

On the common media contract the player owns `currentTime` and this reads it. The
one exception is a click, which is a deliberate seek — a user action, not the
transcript keeping its own idea of the position.

## Related blocks

- **Video** — player and transcript already composed, sharing one bucket
- **VideoPlayer** — the player this follows
