# RulesGrader

Grader that evaluates Match rules top-to-bottom, returning the first match. Supports partial credit and targeted feedback.

```olx:playground
<CapaProblem id="learning_types" title="Learning Depths">
  <RulesGrader>
    <StringMatch answer="transfer" ignoreCase="true" score="1" feedback="Correct!"/>
    <StringMatch answer="transfer learning" ignoreCase="true" score="1" feedback="Correct!"/>
    <StringMatch answer="deep" ignoreCase="true" score="0.5" feedback="Deep learning consolidates understanding, but transfer applies it to new contexts."/>
    <StringMatch answer="deep learning" ignoreCase="true" score="0.5" feedback="Deep learning consolidates understanding, but transfer applies it to new contexts."/>
    <StringMatch answer="surface" ignoreCase="true" score="0.25" feedback="Surface learning is foundational, but the question asks about applying to novel situations."/>
    <StringMatch answer="surface learning" ignoreCase="true" score="0.25" feedback="Surface learning is foundational, but the question asks about applying to novel situations."/>
    <DefaultMatch score="0" feedback="Consider: surface → deep → transfer"/>
    What type of learning involves applying knowledge to novel situations?
    <LineInput />
  </RulesGrader>
  <Explanation><Markdown>
Learning progresses through three phases (Hattie, Fisher and Frey):

**Surface:** Initial exposure to concepts, skills, and strategies. Provides the foundation.

**Deep:** Consolidating understanding and extending surface knowledge to support deeper conceptual understanding.

**Transfer:** Applying consolidated knowledge to new scenarios and different contexts, including metacognitive reflection.
  </Markdown></Explanation>
</CapaProblem>
```

## How It Works

1. Student submits an answer via the input (e.g., LineInput)
2. RulesGrader evaluates each Match rule from top to bottom
3. First rule that matches determines the score and feedback
4. If no rule matches, returns incorrect with no feedback

## Match Block Types

| Block | Description |
|-------|-------------|
| `StringMatch` | Matches text patterns (exact or regexp) |
| `NumericalMatch` | Matches numbers with tolerance |
| `RatioMatch` | Matches ratios/fractions |
| `DefaultMatch` | Always matches (catch-all) |

## Match Block Attributes

All Match blocks support:

| Attribute | Type | Description |
|-----------|------|-------------|
| `score` | number (0-1) | Score to award if matched |
| `feedback` | string | Feedback message |
| `feedbackBlock` | string | ID of block to show as feedback |

Plus their type-specific attributes (e.g., `answer`, `ignoreCase` for StringMatch).

## Partial Credit

Use fractional scores to award partial credit:

```olx:code
<RulesGrader>
  <StringMatch answer="metacognition" ignoreCase="true" score="1" feedback="Correct! Thinking about your own thinking."/>
  <StringMatch answer="reflection" ignoreCase="true" score="0.5" feedback="Related concept - metacognition is more specific."/>
  <DefaultMatch score="0" feedback="Consider: what do we call 'thinking about thinking'?"/>
  <LineInput />
</RulesGrader>
```

## Targeted Feedback

Reference another block for complex feedback:

```olx:code
<RulesGrader>
  <StringMatch answer="chunking" score="0.1" feedbackBlock="chunking_hint"/>
  <LineInput />
</RulesGrader>

<Hidden>
  <Markdown id="chunking_hint">
Good start! Chunking groups information into meaningful units.

How does chunking relate to working memory limitations?
  </Markdown>
</Hidden>
```

