# LineInput

Single-line text input for short student responses like names, single words, or brief answers. Works as an input inside CapaProblem.

```olx:playground
<Vertical id="recall">
  <Markdown>What psychologist is credited with discovering the "testing effect" (showing that retrieval practice strengthens memory)?</Markdown>
  <LineInput id="researcher" placeholder="Last name..." />
</Vertical>
```

## Properties
- `id` (recommended): Unique identifier for the input
- `placeholder` (optional): Hint text displayed when empty

## State Fields
- `value`: The current text entered by the student

## Common Use Cases

### Fill-in-the-Blank

```olx:playground
<Vertical id="fill_blank">
  <Markdown>In Bjork's framework, conditions that make learning harder during practice but improve long-term retention are called _______ difficulties.</Markdown>
  <LineInput id="term" placeholder="Type a term..." />
</Vertical>
```

### Graded Short Answer

```olx:playground
<CapaProblem id="short_answer" title="Terminology">
  <StringGrader answer="testing effect" caseInsensitive="true">
    <Markdown>What is the phenomenon called when taking a test improves later retention more than additional study?</Markdown>
    <LineInput id="effect_name" />
    <Explanation>
      The **testing effect** (also called retrieval practice effect) was demonstrated by Roediger &amp; Karpicke (2006), showing 50% better retention after one week for students who practiced retrieval versus those who restudied.
    </Explanation>
  </StringGrader>
</CapaProblem>
```

### Prediction Prompt

```olx:playground
<Vertical id="predict">
  <Markdown>Before reading the research, predict: Which study method do you think produces better long-term retention?</Markdown>
  <LineInput id="prediction" placeholder="Your prediction..." />
  <Markdown>**Your prediction:**</Markdown>
  <Ref target="prediction" />
</Vertical>
```

## Related Blocks
- **TextArea**: For longer, multi-line responses
- **NumberInput**: For numerical responses
- **StringGrader**: For grading text answers

