# TabularMCQ

Matrix-style multiple choice for surveys, assessments, personality tests, and Likert-scale items.

```olx:playground
<Vertical id="cooperative_survey">
  <Markdown>Rate your experience with each cooperative learning structure:</Markdown>
  <TabularMCQ id="coop_survey">
cols: Never used, Used once, Use sometimes, Use regularly
rows: Jigsaw (Aronson), Think-Pair-Share, Numbered Heads Together, STAD (Slavin)
  </TabularMCQ>
</Vertical>
```

## Basic Usage

```olx:code
<TabularMCQ id="survey">
cols: Strongly Disagree, Disagree, Neutral, Agree, Strongly Agree
rows: Group work improves my learning, I learn well from peers, I prefer working alone
</TabularMCQ>
```

## With Column Values (for scoring)

Column values enable numeric scoring for personality tests and Likert scales:

```olx:playground
<Vertical id="learning_preferences">
  <Markdown>Rate your agreement with each statement:</Markdown>
  <TabularMCQ id="preferences">
cols: Strongly Disagree|-2, Disagree|-1, Neutral|0, Agree|1, Strongly Agree|2
rows: I learn better in groups than alone, Teaching others helps me understand, I value peer feedback
  </TabularMCQ>
</Vertical>
```

## With Row IDs (for analytics/matrix scoring)

Row IDs enable tracking individual responses:

```olx:code
<TabularMCQ id="assessment">
cols: True, False
rows: Jigsaw was developed by Elliot Aronson|jigsaw_author, Positive interdependence is essential|pos_interdep
</TabularMCQ>
```

## Checkbox Mode (multiple selections per row)

```olx:playground
<Vertical id="research_knowledge">
  <Markdown>Which researchers are associated with each cooperative learning contribution?</Markdown>
  <TabularMCQ id="researchers">
mode: checkbox
cols: Aronson, Johnson &amp; Johnson, Slavin, Kagan
rows: Jigsaw method, Five essential elements, STAD/TGT, Structural approach
  </TabularMCQ>
</Vertical>
```

## Graded Mode (with correct answers)

Mark expected answers using `[ColumnLabel]` or `[index]` suffix:

```olx:code
<TabularMCQ id="quiz">
cols: True, False
rows: Positive interdependence means shared goals[True], Individual accountability can be ignored[False]
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
- **Answer**: `[label]` or `[index]` suffix (e.g., `[True]` or `[0]`)

## State Format

- **Radio mode**: `{ rowId: colIndex }` - one selection per row
- **Checkbox mode**: `{ rowId: [colIndex, ...] }` - multiple selections per row

## Related Blocks

- **TabularMCQGrader** - Auto-grades based on specified answers
- **CapaProblem** - Problem container with submit button

