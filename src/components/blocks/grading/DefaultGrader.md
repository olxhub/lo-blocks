# DefaultGrader

Catch-all grader that accepts any answer with a specified score and feedback.

## Usage

```olx:code
<DefaultGrader score="1" feedback="Thank you for sharing your perspective.">
  <Markdown>How do you involve families in your students' learning?</Markdown>
  <TextArea rows="4" />
</DefaultGrader>
```

## Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `score` | number (0-1) | No | Score to award (default: 0) |
| `feedback` | string | No | Feedback message to show |
| `feedbackBlock` | string | No | ID of a block to show as feedback |
| `target` | string | No | ID of input to grade (if not a child) |

## Behavior

- Always "matches" any non-empty input
- Returns the specified score and feedback regardless of what was entered
- Empty input returns UNSUBMITTED

## When to Use

Use DefaultGrader when:
- Any answer should be accepted (e.g., open-ended reflection questions)
- You want to provide feedback without grading
- Collecting peer instruction responses before discussion

For grading with multiple rules and partial credit, use `RulesGrader` with `DefaultMatch` as the catch-all instead.

