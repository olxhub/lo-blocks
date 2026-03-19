# Ref

References and displays values from other blocks. Enables patterns like showing a student's thesis statement while they write supporting arguments, or including student input in LLM prompts.

```olx:playground
<Vertical id="demo">
  <Markdown>Write a claim about effective studying:</Markdown>
  <LineInput id="claim" placeholder="I believe that..." />
  <Markdown>Your claim:</Markdown>
  <Ref target="claim" />
  <Markdown>Now provide evidence to support it:</Markdown>
  <TextArea id="evidence" rows="3" placeholder="Research shows..." />
</Vertical>
```

## Basic Usage

Reference by target ID:
```olx:code
<TextArea id="student_essay" />
<Ref target="student_essay" />
```

Or with child text:
```olx:code
<Ref>student_essay</Ref>
```

## Properties
- `target`: ID of the block to reference
- `visible` (optional): Set to `false` for hidden references (useful in LLM prompts)
- `field` (optional): Access a specific field instead of `getValue()`
- `format` (optional): `"code"` for monospace code block display

## Common Use Cases

### Thesis-Evidence Pattern

Research on writing shows that keeping claims visible while writing supporting arguments improves coherence:

```olx:playground
<Vertical id="thesis_evidence">
  <Markdown>**Step 1:** Write a thesis about the testing effect:</Markdown>
  <TextArea id="thesis" rows="2" placeholder="The testing effect demonstrates that..." />

  <Markdown>**Step 2:** Your thesis:</Markdown>
  <Ref target="thesis" />
  <Markdown>Now provide three pieces of evidence supporting this thesis:</Markdown>
  <DynamicList id="evidence" min="2">
    <TextArea placeholder="Evidence..." rows="2" />
  </DynamicList>
</Vertical>
```

### LLM Prompt Construction

Use Ref to include student work in LLM prompts. Hidden refs are useful when you need the value but don't want it displayed:

```olx:playground
<Vertical id="llm_prompt">
  <Markdown>Explain why spaced practice is more effective than massed practice:</Markdown>
  <TextArea id="explanation" rows="4" />
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      Evaluate this student explanation of spaced practice.

      Key points they should address:
      - Forgetting between sessions forces retrieval (desirable difficulty)
      - Each retrieval strengthens the memory trace
      - Spacing should match desired retention interval

      Be specific about what's correct and what's missing:

      Student response: <Ref target="explanation" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

### Displaying Input Values

Show student responses with labels. Note: each Ref appears on its own line due to the block-level limitation described below.

```olx:playground
<Vertical id="display_values">
  <Markdown>Enter study strategy details:</Markdown>
  <LineInput id="strategy" placeholder="A learning strategy" />
  <LineInput id="percent" placeholder="A percentage (e.g., 25%)" />

  <Markdown>---</Markdown>
  <Markdown>**Your Entries:**</Markdown>
  <Markdown>Strategy:</Markdown>
  <Ref target="strategy" />
  <Markdown>Improvement:</Markdown>
  <Ref target="percent" />
</Vertical>
```

### Aggregating Multiple Inputs

Useful for summarizing or submitting multiple student responses:

```olx:playground
<Vertical id="aggregate">
  <Markdown>Rate your confidence in these study strategies (1-10):</Markdown>
  <Markdown>Retrieval practice:</Markdown>
  <NumberInput id="retrieval" />
  <Markdown>Spaced practice:</Markdown>
  <NumberInput id="spaced" />
  <Markdown>Interleaving:</Markdown>
  <NumberInput id="interleave" />

  <Collapsible id="summary" title="View Summary">
    <Markdown>Your ratings:</Markdown>
    <Markdown>Retrieval practice:</Markdown>
    <Ref target="retrieval" />
    <Markdown>Spaced practice:</Markdown>
    <Ref target="spaced" />
    <Markdown>Interleaving:</Markdown>
    <Ref target="interleave" />
  </Collapsible>
</Vertical>
```

## Technical Notes

**Block-level only:** Ref cannot be embedded inside Markdown text. This means inline patterns like `**My name is <Ref/> and I come from <Ref/>**` aren't currently possible. The examples above use label+value patterns that work with block-level Ref. True inline interpolation requires a future text-span block. (Exception: LLMAction supports embedded Ref for constructing prompts.)

**getValue behavior:**
- Returns a **string** for valid values (all types are formatted)
- Returns an **error object** `{ error: true, message: "..." }` for validation failures

**Value formatting:**
- Strings and numbers: displayed as-is
- Booleans: converted to "true" or "false"
- Arrays of primitives: joined with ", "
- Objects and complex arrays: JSON stringified

## Related Blocks
- **AggregatedInputs**: Collects multiple input values
- **UseDynamic**: Conditional display based on referenced values

## Future Directions

1. **Inline Interpolation**: Allow references inside Markdown text, e.g. `{{claim}}` or `<Ref target="claim" />` within prose
2. **Functional Syntax**: `<Ref>word_count(essay)</Ref>`
3. **Async Functions**: `<Ref>llm_prompt(student_thesis, 'summarize this in 3 bullets')</Ref>`
4. **Concise Notation**: e.g. `<Ref target="block.field" />`

For inline interpolation, Markdown would need to support mixed content parsing. For functional syntax, we'd make a small PEG + evaluator, plus a transformation registration scheme and async handling. For concise notation, we need to handle ambiguity between `edu.mit.field` as ID="edu.mit" field="field" vs ID="edu.mit.field" - likely via a different delimiter like `essay:cursorPosition`.
