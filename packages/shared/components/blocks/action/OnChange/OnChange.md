# OnChange

Fires actions whenever a watched value **changes**. Where `Trigger` is
edge-triggered on truth — once on false→true, then quiet — `OnChange` watches a
value that keeps moving and fires on every new one.

```olx:code
<OnChange watch="@data_checks.checks" target="regrade" />
```

## Attributes

- `watch` (required) — a DSL expression whose **value** is watched, e.g.
  `@sheet.checks`.
- `target` — the action block ID(s) to fire, comma-separated. Inferred from
  context when omitted.

## Why not `Trigger`

`Trigger` asks *has this become true?* That is the wrong shape for keeping a
grader current: the thing being watched is not a condition that flips once, it is
a value that changes as the student types, and **every new value needs grading**.
A `Trigger` would fire on the first edit and stay silent through every one after.

## Notes

- It fires on *change*, not on every render: an identical value does not re-fire.
- The watched expression is evaluated in the ordinary DSL, so it can reach a
  published sheet (`@id.checks`), a field, or anything else addressable.

## Related blocks

- `Trigger` — edge-triggered on a condition becoming true
- `ActionButton` — fires on a press instead of a change
- `DerivedChecks` — the usual thing worth re-running when a field changes
