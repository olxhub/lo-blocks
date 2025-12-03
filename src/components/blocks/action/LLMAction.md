# LLMAction Block

## Overview

The LLMAction block executes LLM (Large Language Model) prompts when triggered by an ActionButton. It references student inputs using `<Ref>` elements and updates target components (typically LLMFeedback) with the response.

## Technical Usage

### Basic Syntax
```xml
<TextArea id="student_response" />
<LLMFeedback id="feedback_display" />
<ActionButton label="Get Feedback">
  <LLMAction id="feedback_action" target="feedback_display">
    Evaluate this student response:
    <Ref id="response_ref" target="student_response" />

    Provide constructive feedback on clarity and completeness.
  </LLMAction>
</ActionButton>
```

### Properties
- `id` (optional): Unique identifier for the action
- `target` (required): ID of component to update with LLM response

### Content
The child content is the prompt sent to the LLM. It can include:
- Plain text instructions
- `<Ref id="unique_id" target="component_id" />` to include student input values
- Markdown formatting

### Action Nesting

LLMAction must be a **child** of ActionButton for automatic discovery:

```xml
<!-- CORRECT: LLMAction nested inside ActionButton -->
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">...</LLMAction>
</ActionButton>

<!-- WRONG: LLMAction as sibling - won't be triggered -->
<LLMAction target="feedback">...</LLMAction>
<ActionButton label="Get Feedback" />
```

## Pedagogical Purpose

LLM-powered feedback supports learning:

1. **Personalized Feedback**: Responses tailored to student input
2. **Immediate Response**: No waiting for instructor feedback
3. **Scalable Assessment**: Handles open-ended responses
4. **Scaffolding**: Can provide hints, explanations, or encouragement

## Common Use Cases

### Essay Feedback
```xml
<TextArea id="essay" />
<LLMFeedback id="feedback" />
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">
    Review this essay for thesis clarity, supporting evidence, and organization:
    <Ref id="essay_ref" target="essay" />
    Provide specific, constructive feedback.
  </LLMAction>
</ActionButton>
```

### Problem-Solving Guidance
```xml
<TextArea id="solution" />
<LLMFeedback id="hints" />
<ActionButton label="Check My Work">
  <LLMAction target="hints">
    The student attempted this math problem:
    <Ref id="solution_ref" target="solution" />
    If incorrect, provide a hint without giving the answer.
  </LLMAction>
</ActionButton>
```

### Text Transformation
```xml
<TextArea id="original" />
<LLMFeedback id="rewritten" />
<ActionButton label="Simplify">
  <LLMAction target="rewritten">
    Rewrite this text in simple English for a young reader:
    <Ref id="original_ref" target="original" />
  </LLMAction>
</ActionButton>
```

## Security Notes

LLM calls are sandboxed and subject to system policies. Content is sent to the configured LLM endpoint.

## Related Blocks
- **LLMFeedback**: Displays LLM responses (typically the `target`)
- **ActionButton**: Triggers the LLM call (must be parent of LLMAction)
- **Ref**: References input values in prompts
- **TextArea**: Collects student text for analysis

## Example File
See `ActionButton.olx` for working examples with LLMAction.
