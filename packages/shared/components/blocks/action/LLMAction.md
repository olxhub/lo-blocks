# LLMAction

Executes LLM prompts when triggered by ActionButton. References student inputs using `<Ref>` and updates target components (typically LLMFeedback) with the response.

```olx:playground
<Vertical id="demo">
  <Markdown>Explain why spaced practice is more effective than massed practice:</Markdown>
  <TextArea id="explanation" rows="4" />
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      A student is explaining spaced vs. massed practice. The key mechanisms are:
      1. Spacing forces retrieval, which strengthens memory (testing effect)
      2. Forgetting between sessions is a "desirable difficulty"
      3. Each relearning episode strengthens the memory trace

      Evaluate their explanation. Be specific about what's correct, what's missing, and avoid generic praise:

      Student response: <Ref target="explanation" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

## Properties
- `target` (required): ID of component to update with LLM response
- `slots` (optional): a checklist the model must complete before writing its feedback. Turns the call into structured output — see below.
- `verdicts` (optional): the verdict values available to every slot. Default `met,absent,unclear`. The **first** value is the satisfied one.

## Forcing a checklist with `slots`

A prompt can ask the model to work through a list of checks, but nothing makes it
finish one — it can answer three of eight and write fluent feedback about the
three. Adding `slots` makes each check a **required property of a strict JSON
schema**, so an incomplete answer is not well-formed at all.

Each entry is `key:Label`, separated by `|`. Append `:opt1/opt2` to give one slot
its own verdict values:

```olx:code
<LLMAction target="fb"
           verdicts="met,absent,unclear"
           slots="claim:States a claim|evidence:Cites evidence|warrant:Links them:met/absent/weak">
  Check each part of the argument, then give feedback.
  Student response: <Ref target="answer" />
</LLMAction>
```

The student sees the model's prose followed by the checklist itself, so which
parts were found is visible rather than inferred. A satisfied slot is ticked;
anything else gets a neutral dot, because a slot can be informational (a
`kind:.../PR/NR` slot reports a category, not a pass or fail) and marking those
as failures would misreport them.

Two things worth knowing:

- **Ordering is load-bearing.** The checks are generated before the prose, so the
  feedback is conditioned on the verdicts rather than rationalised after it.
  Put the "what is this actually?" slot before the "is it the right one?" slot.
- **Provider support is uneven.** The openai and azure paths forward
  `response_format` to the provider; the bedrock path builds its own request body
  and drops it, and the stub provider returns prose. When the schema is not
  honoured the block falls back to showing the unstructured text, so it degrades
  instead of breaking — but the checklist is not guaranteed on those providers.

For a worked example see `content/psychology/bmod_handout1.olx` (question 6),
whose eight slots are ported from the item-by-item scorer in
`~/code/molly_scoring`.

## Content

The child content is the prompt sent to the LLM. It can include:
- Plain text instructions
- `<Ref target="component_id" />` to include student input values
- Context about correct answers or common misconceptions

## Action Nesting

LLMAction must be a **child** of ActionButton:

```olx:code
<!-- CORRECT: LLMAction nested inside ActionButton -->
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">...</LLMAction>
</ActionButton>

<!-- WRONG: LLMAction as sibling - won't be triggered -->
<LLMAction target="feedback">...</LLMAction>
<ActionButton label="Get Feedback" />
```

## Prompt Design

Good prompts include:

1. **Context about correct content** - what should the student know?
2. **Common misconceptions to check for** - what mistakes are typical?
3. **Specific feedback instructions** - avoid generic responses

### Weak Prompt

```olx:code
<LLMAction target="feedback">
  Give feedback on this essay: <Ref target="essay" />
</LLMAction>
```

### Better Prompt

```olx:playground
<Vertical id="better_prompt">
  <Markdown>Explain the difference between interleaving and blocking in practice:</Markdown>
  <TextArea id="answer" rows="3" />
  <LLMFeedback id="fb" />
  <ActionButton label="Check Understanding">
    <LLMAction target="fb">
      The student is explaining interleaving vs. blocking.

      Key points they should include:
      - Interleaving mixes different problem types; blocking groups same types together
      - Interleaving feels harder but produces better transfer (Rohrer &amp; Taylor, 2007)
      - The mechanism is forcing discrimination between problem types

      Common misconceptions to watch for:
      - Thinking that "harder during practice = worse learning"
      - Confusing interleaving with spaced practice

      If they have misconceptions, explain gently. If they're mostly correct, acknowledge specifics rather than generic praise.

      Student response: <Ref target="answer" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

## Multiple Analyses

Trigger multiple LLM calls for different aspects:

```olx:playground
<Vertical id="multi">
  <Markdown>Describe how you would apply retrieval practice in a classroom:</Markdown>
  <TextArea id="plan" rows="4" />
  <LLMFeedback id="accuracy" />
  <LLMFeedback id="practicality" />
  <ActionButton label="Analyze Plan">
    <LLMAction target="accuracy">
      Does this plan accurately reflect research on retrieval practice? Check for: low-stakes quizzing, immediate feedback, spaced intervals.
      Plan: <Ref target="plan" />
    </LLMAction>
    <LLMAction target="practicality">
      Is this plan practical for a real classroom? Consider: time constraints, student engagement, implementation complexity.
      Plan: <Ref target="plan" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

## Related Blocks
- **LLMFeedback**: Displays LLM responses (typically the `target`)
- **ActionButton**: Triggers the LLM call (must be parent)
- **Ref**: References input values in prompts
- **TextArea**: Collects student text for analysis
