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

Attributes are generated from the schema and shown on this block's Overview tab —
name, type, whether it is required, the description, and the permitted values.
A hand-kept copy here is a second source of one table, and the copy is what rots.

## Other Attributes

Attributes are generated from the schema and shown on this block's Overview tab —
name, type, whether it is required, the description, and the permitted values.
A hand-kept copy here is a second source of one table, and the copy is what rots.

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

## Chaining exercises

Multiple timed freewrites can run in succession using `when=` conditions
and `start="render"` on TimedContainer. Each round auto-starts when the
previous one expires:

```xml
<TimedContainer id="r1" duration="30 seconds" start="render" hideuntilstart="true"
                when="!@r1.expired">
  <Markdown>**Round 1:** Brainstorm a world.</Markdown>
  <Freewrite id="fw1" invisible="true" nodelete="true" counter="true" />
</TimedContainer>

<TimedContainer id="r2" duration="30 seconds" start="render" hideuntilstart="true"
                when="@r1.expired &amp;&amp; !@r2.expired">
  <Markdown>**Round 2:** Brainstorm characters.</Markdown>
  <Freewrite id="fw2" invisible="true" nodelete="true" counter="true" />
</TimedContainer>
```

The prompt goes inside the TimedContainer as a `<Markdown>` (not in `before`,
which is only shown for `start="go"`). The pattern
`when="@prev.expired && !@current.expired"` makes each round appear when
the previous one finishes and disappear when it finishes itself. Use a
final `<Markdown when="@lastRound.expired">` to display all results.

See `FreewriteChain.olx` for a full working example.

## Examples

- `Freewrite.olx` — standalone with all options enabled
- `FreewriteDemo.olx` — four variants inside TimedContainers
- `FreewriteChain.olx` — three chained rounds with auto-start and results summary
