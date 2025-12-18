# RulesGrader

Grader that evaluates Match rules top-to-bottom, returning the first match. Supports partial credit and targeted feedback.

## Usage

```xml
<RulesGrader>
  <StringMatch answer="2x" score="1" feedback="Correct!"/>
  <StringMatch answer="x" score="0.25" feedback="Right variable, wrong coefficient"/>
  <DefaultMatch score="0" feedback="Try again"/>
  <LineInput/>
</RulesGrader>
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

```xml
<RulesGrader>
  <StringMatch answer="2x" score="1"/>
  <StringMatch answer="x" score="0.25" feedback="Partial credit"/>
  <DefaultMatch score="0"/>
  <LineInput/>
</RulesGrader>
```

## Targeted Feedback

Reference another block for complex feedback:

```xml
<RulesGrader>
  <StringMatch answer="x" score="0.1" feedbackBlock="hint_problem"/>
  <LineInput/>
</RulesGrader>

<CapaProblem id="hint_problem">
  <!-- Follow-up problem shown as feedback -->
</CapaProblem>
```
