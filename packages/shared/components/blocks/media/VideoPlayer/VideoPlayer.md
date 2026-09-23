# VideoPlayer

Just the video element, speaking the common media contract.

Use **Video** unless the player and its transcript have to sit in different places
on the page: Video composes this block with `<Transcript>` and owns the bucket
they share.

Attributes are generated from the schema and shown on this block's Overview tab.

## The media contract

The player is the only writer of `currentTime`. Anything else that wants to follow
the video — a transcript, a caption, a marker — reads it. A second writer produces
a fight over the position that looks like stutter and is very hard to trace.

## Related blocks

- **Video** — the composed player-plus-transcript
- **Transcript** — the follower
