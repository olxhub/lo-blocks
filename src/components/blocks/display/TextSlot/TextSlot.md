# TextSlot

A slot that receives text from other blocks. Typically used as a target for LLMAction.

## Overview

TextSlot is a simple display component that other blocks can write to. It renders as a `<span>` with the current value. When empty or loading, it shows nothing or a minimal indicator.

The name reflects its purpose: it's a slot in your content where text gets filled in dynamically.

## Basic Usage

```xml
<TextSlot id="my_slot" />

<ActionButton label="Fill Slot">
  <LLMAction target="my_slot">
    Generate some text here.
  </LLMAction>
</ActionButton>
```

## How It Works

TextSlot has two state fields:

- `value`: The text content to display
- `state`: Loading state (tracks LLM_STATUS)

When an LLMAction targets a TextSlot, it writes to both fields. The slot shows:

- Nothing when uninitialized (no value, not loading)
- "..." while the LLM is generating
- The text content once complete

## Common Patterns

### With IntakeGate

The primary use case. IntakeGate watches TextSlots and reveals content when they're populated:

```xml
<IntakeGate targets="greeting">
  <Vertical>
    <TextArea id="name" placeholder="Your name" />
    <ActionButton label="Go">
      <LLMAction target="greeting">
        Write a friendly greeting for <Ref>name</Ref>
      </LLMAction>
    </ActionButton>
  </Vertical>

  <Markdown>
    <TextSlot id="greeting" />
  </Markdown>
</IntakeGate>
```

### Inline in Problems

Embed personalized context within problem text:

```xml
<CapaProblem>
  <p><TextSlot id="problem_context" /></p>
  <p>What is the total cost?</p>
  <KeyGrader>
    <NumberInput id="answer" />
  </KeyGrader>
</CapaProblem>
```

### Multiple Slots

Generate several pieces of content in parallel:

```xml
<ActionButton label="Generate All">
  <LLMAction target="intro">Write an introduction...</LLMAction>
  <LLMAction target="example">Create an example...</LLMAction>
  <LLMAction target="summary">Summarize...</LLMAction>
</ActionButton>

<Vertical>
  <TextSlot id="intro" />
  <TextSlot id="example" />
  <TextSlot id="summary" />
</Vertical>
```

## Styling

TextSlot renders with class `text-slot`. During loading, it has `text-slot--loading`.

```css
.text-slot {
  /* Default: no special styling, flows with surrounding text */
}

.text-slot--loading {
  /* Shows "..." indicator */
}
```

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Unique identifier (used as LLMAction target) |

## State Fields

| Field | Type | Description |
|-------|------|-------------|
| `value` | string | The text content |
| `state` | LLM_STATUS | Loading state from LLM |

## Comparison with LLMFeedback

Both TextSlot and LLMFeedback can receive LLM output. The difference:

- **LLMFeedback**: Styled feedback box with visual treatment, intended as standalone feedback display
- **TextSlot**: Minimal span, intended to flow inline with other content or be watched by IntakeGate

Use TextSlot when you want generated text to blend into surrounding content. Use LLMFeedback for prominent, styled feedback sections.

## Related Blocks

- **IntakeGate**: Watches TextSlots to control content reveal
- **LLMAction**: Writes to TextSlot via `target` attribute
- **LLMFeedback**: Alternative for styled feedback display
- **Ref**: References values in LLM prompts
