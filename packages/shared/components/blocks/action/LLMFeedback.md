# LLMFeedback

Displays AI-generated responses from LLMAction calls. Shows a robot icon, spinner while loading, and renders feedback text when available.

```olx:playground
<Vertical id="demo">
  <Markdown>Explain the difference between formative and summative assessment:</Markdown>
  <TextArea id="essay" rows="3" placeholder="Formative assessment is..." />
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      A student is learning about assessment types. Evaluate their explanation for accuracy and suggest one thing they might add:
      <Ref target="essay" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

## Properties
- `id` (required): Unique identifier (referenced by LLMAction's `target` attribute)
- `placeholder` (optional): Text shown before any feedback is received

## State
- `value`: The feedback text received from the LLM
- `state`: Loading state (waiting, complete, error)

## Visual States
- **Empty**: No feedback requested yet (shows placeholder if set)
- **Loading**: Spinner shown while LLM processes
- **Complete**: Feedback text displayed with robot icon
- **Error**: Error message displayed

## Complete Pattern

LLMFeedback is typically used with TextArea, LLMAction, and ActionButton. Note that LLMAction is nested **inside** ActionButton:

```olx:code
<TextArea id="essay" />
<LLMFeedback id="feedback" />
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">
    Prompt here: <Ref target="essay" />
  </LLMAction>
</ActionButton>
```

## Pedagogical Purpose

LLMFeedback supports learning through:

1. **Immediate Feedback**: Students see responses quickly
2. **Visual Clarity**: Robot icon indicates AI-generated content
3. **Loading Indication**: Spinner shows processing in progress
4. **Persistent Display**: Feedback remains visible for review

## Common Use Cases

### Essay Review

```olx:playground
<Vertical id="essay_demo">
  <Markdown>Describe how Bloom's Taxonomy can guide lesson planning:</Markdown>
  <TextArea id="essay" rows="4" />
  <LLMFeedback id="review" />
  <ActionButton label="Get Review">
    <LLMAction target="review">
      Review this student's understanding of Bloom's Taxonomy. Check if they correctly describe the levels and their application to lesson planning:
      <Ref target="essay" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

### Problem Hints

```olx:playground
<Vertical id="hint_demo">
  <Markdown>What is the effect size (Cohen's d) if the treatment mean is 85, control mean is 80, and pooled SD is 10?</Markdown>
  <NumberInput id="answer" />
  <LLMFeedback id="hint" />
  <ActionButton label="Get Hint">
    <LLMAction target="hint">
      The student answered: <Ref target="answer" />
      The correct answer is 0.5. If they're close, encourage them. If not, give a hint about the formula without revealing the answer.
    </LLMAction>
  </ActionButton>
</Vertical>
```

### Multiple Feedback Panels

```olx:playground
<Vertical id="multi_demo">
  <Markdown>Write a learning objective for a lesson on the water cycle:</Markdown>
  <TextArea id="objective" rows="2" placeholder="Students will be able to..." />
  <LLMFeedback id="bloom" />
  <LLMFeedback id="measurable" />
  <ActionButton label="Analyze">
    <LLMAction target="bloom">What Bloom's level does this target? <Ref target="objective" /></LLMAction>
    <LLMAction target="measurable">Is this objective measurable? <Ref target="objective" /></LLMAction>
  </ActionButton>
</Vertical>
```

## Related Blocks
- **LLMAction**: Triggers LLM calls that populate this component
- **ActionButton**: User interaction to trigger feedback
- **TextArea**: Collects input for LLM analysis
- **Ref**: References input values in LLMAction prompts
