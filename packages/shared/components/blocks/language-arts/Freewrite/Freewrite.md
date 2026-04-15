# Freewrite

A freewriting exercise block based on Peter Elbow's technique from *Writing
Without Teachers* (1973). Students write continuously with configurable
constraints that bypass the inner critic — no re-reading, no editing, just
forward momentum. The constraints are digitally enforced, not honor-system.

This block is experimental. The set of options will likely be narrowed in
future versions as we learn which combinations are most effective in
practice.

## Usage

Standalone with a Reveal button:

```xml
<Freewrite invisible="true" nodelete="true" counter="true" pace="true" reveal="true" />
```

Inside a TimedContainer for timed sessions:

```xml
<TimedContainer duration="3 minutes" hideuntilstart="true"
                before="Write whatever comes to mind. Don't stop.">
  <Freewrite invisible="true" nodelete="true" counter="true" pace="true" />
</TimedContainer>
```

## Constraints

All constraints default to off. The teacher opts into each one.

| Attribute   | Description |
|-------------|-------------|
| `invisible` | Hide text while writing. Students cannot see what they type. Text is revealed when the exercise ends (via Reveal button, pace decay, or TimedContainer expiry). |
| `nodelete`  | Disable backspace, delete, and cut. Cursor is locked to the end of the text. Forward-only writing. |
| `counter`   | Show a live word count. Displayed prominently when text is hidden (since it's the student's only progress feedback). |
| `pace`      | Show a pace indicator bar that decays from green to red when the student pauses. Resets on each non-whitespace keystroke. When the bar reaches zero, the exercise auto-locks (textarea goes read-only). |

## Other Attributes

| Attribute   | Type     | Default      | Description |
|-------------|----------|--------------|-------------|
| `reveal`    | boolean  | `false`      | Show a Reveal button that ends the exercise: text becomes visible and the textarea goes read-only. |
| `pacedecay` | duration | `5 seconds`  | How long the pace bar takes to decay fully. Shorter values (e.g. `2 seconds`) create more pressure to keep writing. |
| `rows`      | number   | `8`          | Number of visible text rows. |
| `placeholder` | string | —           | Placeholder text shown in the empty textarea. |

## Pedagogical notes

Elbow's freewriting technique asks students to write without stopping for a
fixed period. The goal is to separate the *generating* phase of writing from
the *editing* phase. Students who struggle with blank-page anxiety or
compulsive self-editing often find this liberating.

The **invisible + nodelete** combination is the strongest form: students
cannot see or edit what they've written. This forces genuine
stream-of-consciousness writing. The **reveal moment** — when the text
becomes visible — is often surprising and pedagogically powerful.

The **pace bar** adds gamification: it creates gentle (or not so gentle,
with a short `pacedecay`) pressure to keep writing. The bar acts as both
motivator and fuse — stop writing long enough and the exercise locks. Only
non-whitespace characters reset the bar (no gaming with the spacebar).

## Interaction with TimedContainer

When placed inside a `<TimedContainer>`, the timer handles the session
duration. On expiry, TimedContainer marks its content as inert, which
automatically reveals invisible text (via CSS) and disables the textarea.
Use `hideuntilstart="true"` on TimedContainer to hide the textarea until the
student clicks Start.

## Examples

- `Freewrite.olx` — standalone with all options enabled
- `FreewriteDemo.olx` — four variants inside TimedContainers
