# DefaultGrader

Catch-all grader that accepts any answer with a specified score and feedback.

```olx:playground
<CapaProblem id="reflection" title="Teaching Reflection">
  <DefaultGrader score="1" feedback="Thank you for sharing your perspective.">
    How do you involve families in your students' learning?
    <TextArea rows="3" />
  </DefaultGrader>
</CapaProblem>
```

## Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `score` | number (0-1) | Score to award (default: 0) |
| `feedback` | string | Feedback message to show |

## When to Use

Use DefaultGrader when:
- Any answer should be accepted (open-ended reflections)
- You want to provide feedback without grading
- Collecting peer instruction responses before discussion

## As DefaultMatch in RulesGrader

Inside RulesGrader, use `DefaultMatch` as a catch-all for inputs not matched by other rules:

```olx:playground
<CapaProblem id="rules_demo" title="Arithmetic">
  <RulesGrader>
    What is 2 + 2?
    <StringMatch answer="4" score="1" feedback="Correct!" />
    <StringMatch answer="four" ignoreCase="true" score="1" feedback="Correct! (we accept words too)" />
    <DefaultMatch score="0" feedback="That's not right. 2 + 2 = 4." />
    <LineInput />
  </RulesGrader>
</CapaProblem>
```

Without DefaultMatch, unmatched inputs receive score 0 with no feedback.

## Related Blocks
- **RulesGrader**: Container for multiple matching rules
- **StringMatch**: Match text patterns
- **NumericalMatch**: Match numbers with tolerance
