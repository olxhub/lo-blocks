# HelloAction

A test action block that shows a "Hello, World!" alert when triggered.

Useful for debugging: if an LLMAction or grader isn't working, swap in HelloAction to determine whether the action isn't being triggered or the action itself isn't doing anything. HelloAction is guaranteed to produce visible output (a browser alert).

## Usage

Actions can be associated with ActionButton in three ways:

```olx:code
<!-- Nested inside ActionButton (recommended) -->
<ActionButton label="Click me!">
  <HelloAction />
</ActionButton>

<!-- As a sibling with explicit target -->
<HelloAction id="hello" />
<ActionButton label="Click me!" target="hello" />

<!-- Action wrapping the button (less common) -->
<HelloAction>
  <ActionButton label="Click me!" />
</HelloAction>
```

When the button is clicked, it finds related actions via `inferRelatedNodes`, which searches children, parents, and explicit targets.

## Related Blocks

- **ActionButton**: Triggers the action on click
- **LLMAction**: Action that makes LLM calls

