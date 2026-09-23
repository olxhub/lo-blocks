# CompactPopout

Content that opens out of the flow — a reference, a worked example, a long aside —
without taking the space it would need inline.

Attributes are generated from the schema and shown on this block's Overview tab.

## `mode` is three different things, not three styles

- `fullscreen` — the content takes the whole viewport
- `window` — it opens in an overlay over the page
- `target` — it is REPOINTED into another block's place, once

`target` is the one that surprises people: it is a one-time reveal, not a
per-mount one. The block records that it has already repointed, so that on
restore — when every previously-revealed embed re-mounts at once — it does not
fire again and clobber the target's restored value.

## Related blocks

- **Collapsible** — for content that expands in place rather than out of the flow
- **Flash** — to point at something already on screen
