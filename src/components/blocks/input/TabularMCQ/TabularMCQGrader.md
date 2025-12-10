# TabularMCQGrader

Grades TabularMCQ responses by comparing selections against expected answers.

## Usage

```xml
<CapaProblem id="quiz">
  <TabularMCQGrader target="mcq_input">
    <Markdown>Identify the part of speech:</Markdown>
    <TabularMCQ id="mcq_input">
cols: Noun, Verb, Adjective
rows: Dog[Noun], Run[Verb], Happy[Adjective]
    </TabularMCQ>
  </TabularMCQGrader>
</CapaProblem>
```

## How It Works

1. Reads expected answers from TabularMCQ rows (e.g., `Dog[Noun]`)
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

## Example: Parts of Speech Quiz

See [TabularMCQGraded.olx](./TabularMCQGraded.olx) for a complete example.

## Related Blocks

- **TabularMCQ** - The input component
- **CapaProblem** - Problem container with submit button
- **KeyGrader** - Similar grader for ChoiceInput
