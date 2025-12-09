# TabularMCQ

Matrix-style multiple choice for surveys, assessments, and personality tests.

## Basic Usage

```xml
<Markdown>Rate each person:</Markdown>
<TabularMCQ id="survey">
cols: love, like, neutral, dislike, hate
rows: Jim, Sue, Bob, Alice
</TabularMCQ>
```

## With Column Values (for scoring)

Column values enable numeric scoring for personality tests and Likert scales:

```xml
<TabularMCQ id="personality">
cols: Strongly Disagree|-2, Disagree|-1, Neutral|0, Agree|1, Strongly Agree|2
rows: I enjoy meeting new people|extrovert_1, I prefer quiet evenings|introvert_1
</TabularMCQ>
```

## With Row IDs (for analytics/matrix scoring)

Row IDs enable tracking individual responses in analytics:

```xml
<TabularMCQ id="assessment">
cols: Yes, No, Maybe
rows: Question 1|q1, Question 2|q2, Question 3|q3
</TabularMCQ>
```

## Checkbox Mode (multiple selections per row)

```xml
<TabularMCQ id="subjects">
mode: checkbox
cols: Math, Science, Art, Music
rows: Jim, Sue, Bob
</TabularMCQ>
```

## Graded Mode (with correct answers)

Mark expected answers using `[ColumnLabel]` or `[index]` suffix:

```xml
<TabularMCQ id="quiz">
cols: Noun, Verb, Adjective
rows: Dog[Noun], Run[Verb], Happy[Adjective]
</TabularMCQ>
```

With column indices:

```xml
<TabularMCQ id="quiz2">
cols: A, B, C, D
rows: Question 1[0], Question 2[2], Question 3[1]
</TabularMCQ>
```

## Syntax Reference

```
mode: checkbox           # Optional: 'radio' (default) or 'checkbox'
cols: Col1, Col2|value   # Column labels with optional |value for scoring
rows: Row1|id[answer]    # Row labels with optional |id and [answer]
```

- **Delimiter**: comma (`,`)
- **Column value**: `|number` suffix (e.g., `Agree|2`)
- **Row ID**: `|string` suffix (e.g., `Question|q1`)
- **Answer**: `[label]` or `[index]` suffix (e.g., `[Noun]` or `[0]`)

## State Format

- **Radio mode**: `{ rowId: colIndex }` - one selection per row
- **Checkbox mode**: `{ rowId: [colIndex, ...] }` - multiple selections per row

## API (locals)

Available to graders via `inputApi`:

- `getConfig()` - Full parsed config
- `getRows()` - Array of row objects
- `getCols()` - Array of column objects
- `getMode()` - 'radio' or 'checkbox'
- `getAnswers()` - Expected answers: `{ rowId: colIndex }`
- `getColValues()` - Column values: `{ colIndex: value }`
- `getScore()` - Calculate total score from selections

## Related Blocks

- **TabularMCQGrader** - Auto-grades based on specified answers
- **CapaProblem** - Problem container with submit button
