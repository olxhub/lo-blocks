# LLMFeedback Block

## Overview

The LLMFeedback block displays AI-generated responses from LLMAction calls. It shows a robot icon, displays a spinner while waiting for responses, and renders the feedback text when available.

## Technical Usage

### Basic Syntax
```xml
<LLMFeedback id="feedback" />
```

### Properties
- `id` (required): Unique identifier (referenced by LLMAction's `target` attribute)

### State Fields
- `value`: The feedback text received from the LLM
- `state`: Loading state (waiting, complete, error)

### Visual States
- **Empty**: No feedback requested yet
- **Loading**: Spinner shown while LLM processes
- **Complete**: Feedback text displayed with robot icon
- **Error**: Error message displayed

## Complete Pattern

LLMFeedback is typically used with TextArea, LLMAction, and ActionButton:

```xml
<!-- Input: where student writes -->
<TextArea id="essay" />

<!-- Output: where feedback appears -->
<LLMFeedback id="feedback" />

<!-- Trigger: button with nested action -->
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">
    Evaluate this writing:
    <Ref id="essay_ref" target="essay" />
  </LLMAction>
</ActionButton>
```

Note that LLMAction is nested **inside** ActionButton, and LLMFeedback's ID matches LLMAction's `target`.

## Pedagogical Purpose

LLMFeedback supports learning through:

1. **Immediate Feedback**: Students see responses quickly
2. **Visual Clarity**: Robot icon indicates AI-generated content
3. **Loading Indication**: Spinner shows processing in progress
4. **Persistent Display**: Feedback remains visible for review

## Common Use Cases

### Essay Review
```xml
<TextArea id="essay" />
<LLMFeedback id="review" />
<ActionButton label="Get Review">
  <LLMAction target="review">
    Review this essay for clarity and structure:
    <Ref id="e_ref" target="essay" />
  </LLMAction>
</ActionButton>
```

### Problem Hints
```xml
<NumberInput id="answer" />
<LLMFeedback id="hint" />
<ActionButton label="Get Hint">
  <LLMAction target="hint">
    The student answered: <Ref id="a_ref" target="answer" />
    Provide a helpful hint without revealing the answer.
  </LLMAction>
</ActionButton>
```

### Multiple Feedback Panels
```xml
<TextArea id="text" />
<LLMFeedback id="grammar" />
<LLMFeedback id="style" />
<ActionButton label="Analyze">
  <LLMAction target="grammar">Check grammar: <Ref id="g" target="text" /></LLMAction>
  <LLMAction target="style">Analyze style: <Ref id="s" target="text" /></LLMAction>
</ActionButton>
```

## Related Blocks
- **LLMAction**: Triggers LLM calls that populate this component
- **ActionButton**: User interaction to trigger feedback (parent of LLMAction)
- **TextArea**: Collects input for LLM analysis
- **Ref**: References input values in LLMAction prompts

## Example File
See `ActionButton.olx` for working examples with LLMFeedback.
