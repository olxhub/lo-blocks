# TextArea

Multi-line text input for longer student responses. Supports essays, explanations, self-explanations, and open-ended answers.

```olx:playground
<Vertical id="demo">
  <Markdown>After reading about the spacing effect, explain in your own words why distributed practice is more effective than massed practice:</Markdown>
  <TextArea id="explanation" rows="4" placeholder="Distributed practice works better because..." />
</Vertical>
```

## Properties
- `placeholder` (optional): Hint text displayed when empty
- `rows` (optional): Number of visible text rows

## State
- `value`: The current text content

## getValue
Returns the text string entered by the student.

## Pedagogical Purpose

TextArea enables **self-explanation**, one of the most effective learning strategies. Chi et al. (1989) found that students who explained material to themselves learned significantly more than those who didn't. The act of generating explanations:

1. **Reveals gaps**: Students discover what they don't understand
2. **Promotes integration**: Forces connection to prior knowledge
3. **Deepens encoding**: Generation is more effective than re-reading

## Common Use Cases

### Self-Explanation Prompts

Research shows prompting students to explain *why* something works improves transfer:

```olx:playground
<Vertical id="self_explain">
  <Markdown>
A physics student solves this problem:

*A 2kg ball dropped from 5m. What's its speed at the bottom?*

Using v² = 2gh, they get v = 10 m/s.
  </Markdown>
  <Markdown>**Explain why energy conservation (mgh = ½mv²) gives the same answer:**</Markdown>
  <TextArea id="explanation" rows="3" placeholder="The energy approach works because..." />
</Vertical>
```

### Retrieval Practice

The testing effect shows retrieval strengthens memory more than re-reading. Use TextArea for free recall:

```olx:playground
<Vertical id="retrieval">
  <Markdown>Without looking back, list everything you remember about how spaced practice affects long-term retention:</Markdown>
  <TextArea id="recall" rows="4" placeholder="From what I remember..." />
  <Collapsible id="check" title="Check your recall">
    <Markdown>
Key points:
- Spacing produces better long-term retention than massing
- Optimal spacing increases as retention interval increases
- Forgetting between sessions is actually beneficial ("desirable difficulty")
- Cepeda et al. (2008): optimal gap is 10-20% of retention interval
    </Markdown>
  </Collapsible>
</Vertical>
```

### Prediction Before Instruction

Having students predict outcomes before learning improves subsequent encoding:

```olx:playground
<Vertical id="predict">
  <Markdown>Before watching the video on peer instruction, predict: Why might having students discuss physics problems with each other improve learning more than additional lectures?</Markdown>
  <TextArea id="prediction" rows="3" placeholder="I think discussion helps because..." />
</Vertical>
```

### With LLM Feedback

TextArea integrates with LLM-based feedback for formative assessment:

```olx:playground
<Vertical id="llm_demo">
  <Markdown>Explain why interleaving different problem types during practice leads to better transfer than blocking by type:</Markdown>
  <TextArea id="response" rows="4" />
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      A student is explaining interleaving vs. blocking in learning. The key insight is that interleaving forces discrimination between problem types and strengthens retrieval of appropriate strategies, even though it feels harder during practice (a "desirable difficulty").

      Check if they mention: (1) discrimination/categorization benefits, (2) the counterintuitive finding that blocked feels easier but interleaved produces better transfer, (3) any connection to real-world application.

      Student response: <Ref target="response" />
    </LLMAction>
  </ActionButton>
</Vertical>
```
