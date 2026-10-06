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
- `max` (optional): the sheet's total, where the slot points deliberately do not sum to it.
- `showChecks` (optional): show the student the checklist beside the feedback.
- `choices` (optional): named value sets a `pick(...)` slot draws from.
- `free` (optional): verdicts that are **not** satisfying and still cost nothing — see below.

### Computed checks

A slot can be **computed** from other answers instead of asked. A computed check
is left OUT of the response schema — asking for an answer the grader is going to
overwrite invites the model to contradict it — and is resolved before scoring.

Attributes are generated from the schema and shown on this block's Overview tab —
name, type, whether it is required, the description, and the permitted values.
A hand-kept copy here is a second source of one table, and the copy is what rots.

They resolve in a fixed order — `equals`, `expect`, `forbid`, then **`maps` last**,
so a mapped check may read a pick an earlier rule wrote.

Each rule names the key it computes. Worked examples of the three most common:

```olx:code
<!-- `maps`: one pick's value decides a NAMED verdict, so a check with two kinds
     of failure keeps them apart. `legend` is never asked; it is computed. -->
<LLMAction target="feedback"
  choices="box_kind:period_names,software_placeholders,nothing"
  slots="series_box:What the legend box holds:pick(box_kind)|legend:Legend present@2"
  maps="legend:series_box:period_names~met,nothing~absent,*~incomplete" />

<!-- `expect`: a classification compared against a value the item authored. -->
<LLMAction target="feedback"
  choices="answer_kind:A,B,C,D,unclear"
  slots="observed:Which kind this shows:pick(answer_kind)|right:Shows the kind asked for@2"
  expect="right:observed=PR" />

<!-- `forbid`: fails only when a COMBINATION holds; each operand stays its own
     question, so the model is never asked to report the combination. -->
<LLMAction target="feedback"
  slots="a1:First example:met/absent@1|a2:Second example:met/absent@1|none:Gave an example@2"
  forbid="none:a1=absent,a2=absent" />
```

An unmapped pick answer is **not** satisfied: with no matching pair and no `*`
fallback the sheet has not said what to do, and crediting on silence is the
failure mode `forbid`'s "anything else passes" already risks.

## `free` — a verdict that is not satisfying and costs nothing

`free="slot:verdict,verdict|slot:verdict"`, e.g. `free="claim_stated:unclear"`.

This runtime credits only the satisfying verdict and **fails everything else**, so
without `free` a third verdict such as `unclear` costs the slot its whole points.
An independent paper scorer charges only what a deduction code names, so the same
verdict costs nothing there. Those are **opposite defaults**, and they agree only
while the two enumerations happen to be complements — which nothing enforces.

`free` removes the default: it names, per slot, the verdicts that are unsatisfied
and uncharged.

- **Declared, never inferred.** "A verdict with no deduction code is free" looks
  equivalent and is not: where a code is keyed on a counterpart name, it reads as
  missing and a real failure would be forgiven.
- It does **not** change the response schema. The verdict is still offered and
  still asked for; `free` decides only what it costs.
- The verdicts ride **on the slot**, so a published sheet re-scores by the rules
  it was written with.
- It does **not** rescue a **gate**. A gating slot answered with a forgiven
  verdict still voids the item, while costing no points of its own. Those two
  readings pull against each other; no content relies on it, and the behaviour is
  pinned by test rather than endorsed.

```olx:code
<!-- `unclear` is offered, asked for, and costs nothing. `absent` still costs 2. -->
<LLMAction target="feedback"
  slots="claim_stated:Names the claim:met/absent/unclear@2|why:Says why@2"
  free="claim_stated:unclear" />
```

| the model answers | satisfied? | charged? | item scores |
|---|---|---|---|
| `met` | yes | — | 4 of 4 |
| `absent` | no | **yes**, 2 | 2 of 4 |
| `unclear` | no | **no** — declared free | 4 of 4 |

Read the third row carefully: the check is **not** satisfied, and the student
still keeps the points. That is the whole purpose — "could not tell" is not the
same judgement as "did not do it", and without `free` this runtime cannot say so.

## Counting slots

A counting slot is authored `key:Label:count(n)` and is answered with a **number**
in its own `count` field — *"How many. A number, not a judgement."* Its members
are derived from the count and left out of the schema.

```olx:code
<!-- RIGHT: the count is its own question, answered with a number, and the three
     members are derived from it — so "three reasons" is asked once, not twice. -->
<LLMAction target="feedback"
  slots="reasons_given:How many reasons:count(3)|r1:First@1|r2:Second@1|r3:Third@1"
  counts="reasons_given:r1,r2,r3" />

<!-- WRONG, and it fails SILENTLY: an enumerated list puts the number in
     `verdict`, which nothing reads any more. Every member scores absent. -->
<LLMAction target="feedback"
  slots="reasons_given:How many reasons:3/2/1/0|r1:First@1|r2:Second@1|r3:Third@1"
  counts="reasons_given:r1,r2,r3" />
```

The tolerance that used to read a count back out of `verdict` was removed once
every counting slot had migrated. The offline mirror lost it at the same moment
and deliberately so: while one side tolerates a count in `verdict` and the other
does not, the same recorded answer scores differently on each engine.

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

For a worked example see the course content that uses this block,
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
