# TextSlot

A slot that receives text from other blocks. Typically used as a target for LLMAction.

## Overview

TextSlot is a simple display component that other blocks can write to. It renders as a `<span>` with the current value. When empty or loading, it shows nothing or a minimal indicator.

The name reflects its purpose: it's a slot in your content where text gets filled in dynamically.

## Basic Usage

```olx:playground
<Vertical id="basic_slot">
  <TextSlot id="my_slot" />
  <ActionButton label="Fill Slot">
    <LLMAction target="my_slot">
      Write a one-sentence fact about memory.
    </LLMAction>
  </ActionButton>
</Vertical>
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

```olx:playground
<IntakeGate id="gate_demo" targets="personalized_intro">
  <Vertical>
    <Markdown>What's your learning goal?</Markdown>
    <TextArea id="goal" placeholder="I want to learn..." />
    <ActionButton label="Go">
      <LLMAction target="personalized_intro">
        Write an introduction to metacognition for someone whose goal is: <Ref>goal</Ref>
      </LLMAction>
    </ActionButton>
  </Vertical>

  <Vertical>
    <TextSlot id="personalized_intro" />
  </Vertical>
</IntakeGate>
```

### Inline in Problems

Embed personalized context within problem text:

```olx:playground
<Vertical id="inline_demo">
  <ActionButton label="Generate Scenario">
    <LLMAction target="problem_context">
      Write a brief scenario (2-3 sentences) about a student preparing for an exam next week.
    </LLMAction>
  </ActionButton>
  <CapaProblem id="study_strategy" title="Study Strategy">
    <TextSlot id="problem_context" />
    Based on this scenario, what study strategy would you recommend?
    <KeyGrader>
      <ChoiceInput>
        <Key>Spaced retrieval practice</Key>
        <Distractor>Cramming the night before</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>
</Vertical>
```

### Multiple Slots

Generate several pieces of content in parallel:

```olx:playground
<Vertical id="multi_slot">
  <ActionButton label="Generate All">
    <LLMAction target="surface">Define surface learning in one sentence.</LLMAction>
    <LLMAction target="deep">Define deep learning in one sentence.</LLMAction>
    <LLMAction target="transfer">Define transfer learning in one sentence.</LLMAction>
  </ActionButton>
  <Markdown>**Surface:**</Markdown>
  <TextSlot id="surface" />
  <Markdown>**Deep:**</Markdown>
  <TextSlot id="deep" />
  <Markdown>**Transfer:**</Markdown>
  <TextSlot id="transfer" />
</Vertical>
```

## Styling

TextSlot renders with class `text-slot`. During loading, it has `text-slot--loading`.

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

