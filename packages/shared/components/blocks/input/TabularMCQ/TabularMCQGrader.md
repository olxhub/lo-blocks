# TabularMCQGrader

Grades TabularMCQ responses by comparing selections against expected answers.

## Usage

```olx:playground
<CapaProblem id="coop_elements" title="Cooperative Learning">
  <TabularMCQGrader target="elements_quiz">
    Match each element to the correct researcher:
    <TabularMCQ id="elements_quiz">
cols: Johnson &amp; Johnson, Slavin, Aronson
rows: Positive interdependence[Johnson &amp; Johnson], STAD method[Slavin], Jigsaw classroom[Aronson]
    </TabularMCQ>
  </TabularMCQGrader>
</CapaProblem>
```

## How It Works

1. Reads expected answers from TabularMCQ rows (e.g., `Positive interdependence[Johnson &amp; Johnson]`)
2. Compares student selections against expected answers
3. Returns CORRECT if all rows match, INCORRECT otherwise
4. Score = (correct rows) / (total graded rows)

## Grading Behavior

- **Graded mode**: Rows with `[answer]` suffix are graded
- **Survey mode**: Rows without answers return UNGRADED
- **Partial credit**: Score is calculated as fraction correct

## State Fields

- `correct` - CORRECTNESS enum (CORRECT, INCORRECT, or UNGRADED)
- `message` - Feedback message (e.g., "2 of 3 correct")
- `score` - Numeric score from 0 to 1

## Related Blocks

- **TabularMCQ** - The input component
- **CapaProblem** - Problem container with submit button
- **KeyGrader** - Similar grader for ChoiceInput

