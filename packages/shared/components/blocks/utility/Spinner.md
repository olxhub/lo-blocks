# Spinner

Displays a loading/processing indicator. Shows users that an operation is in progress.

## Syntax

```olx:code
<Spinner />
```

## Properties
- `id` (optional): Unique identifier

## Purpose

Spinner provides visual feedback during:

1. **Loading States**: Content being fetched
2. **Processing**: LLM calls or other async operations
3. **Transitions**: Between content states

## Usage Context

Spinner is typically used internally by other components:
- LLMFeedback shows Spinner while waiting for AI response
- IntakeGate shows Spinner during content generation
- Content loading displays Spinner during fetch

While Spinner can be used directly, it's more common to see it as part of other components' internal rendering.

## Related Blocks
- **LLMFeedback**: Uses Spinner during AI processing
- **IntakeGate**: Shows Spinner during personalization

