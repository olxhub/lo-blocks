# DefaultMatch

Catch-all matching rule for use inside RulesGrader. Always matches any input.

## Usage

```xml
<RulesGrader>
  <StringMatch answer="correct" score="1" feedback="Right!"/>
  <DefaultMatch score="0" feedback="Try again"/>
  <LineInput/>
</RulesGrader>
```

## Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `score` | number (0-1) | No | Score to award (default: 0) |
| `feedback` | string | No | Feedback message |
| `feedbackBlock` | string | No | ID of block to show as feedback |

## Behavior

- Always matches any non-empty input
- Should be the last rule in a RulesGrader
- Provides a catch-all for inputs not matched by previous rules

## Without DefaultMatch

If no DefaultMatch is present and no other rules match, the student receives:
- Score: 0
- Correctness: INCORRECT
- No feedback message

## See Also

- `RulesGrader` - Container for Match rules
- `StringMatch` - Match text patterns
- `NumericalMatch` - Match numbers with tolerance
