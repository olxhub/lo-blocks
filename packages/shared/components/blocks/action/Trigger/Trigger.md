# Trigger

Fires the actions inside it when a watched expression becomes true.

Renders nothing: it is a rule about when something happens, placed in the content
where that something belongs.

Attributes are generated from the schema and shown on this block's Overview tab.

## `watch` is an expression, not an event

`watch="@grader.correct === correctness.correct"` reads state and fires on the
TRANSITION into true — not on every render while it stays true. `mode` decides
whether it may fire again afterwards.

That distinction is the whole block: a rule that fired on every render would run
its actions continuously, and one that fired only once could not respond to a
learner changing their answer back.

## Related blocks

- **OnShow** — fires when a block becomes visible, rather than on a condition
- **OnChange** — fires on a value changing, rather than on an expression turning true
- **ActionButton** — when the learner decides, rather than the state
