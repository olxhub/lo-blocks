# TabularMCQGrader

Grades TabularMCQ responses by comparing selections against expected answers.

## Usage

```olx:playground
<CapaProblem id="freire_quiz" title="Banking vs. Problem-Posing Education">
  <Markdown>
Classify each practice as *banking* or *problem-posing* education
(Freire, *Pedagogy of the Oppressed*, 1970):
  </Markdown>
  <TabularMCQGrader>
    <TabularMCQ id="freire_classify">
cols: Banking, Problem-Posing
rows:
  - Mythicizes reality to conceal certain facts|mythicize[Banking]
  - Sets itself the task of demythologizing|demythologize[Problem-Posing]
  - Resists dialogue|resists_dialogue[Banking]
  - Regards dialogue as indispensable to the act of cognition|dialogue[Problem-Posing]
  - Treats students as objects of assistance|objects[Banking]
  - Makes students critical thinkers|critical[Problem-Posing]
  - Inhibits creativity and domesticates consciousness|inhibit[Banking]
  - Stimulates true reflection and action upon reality|reflection[Problem-Posing]
    </TabularMCQ>
  </TabularMCQGrader>
</CapaProblem>
```

## How It Works

1. Reads expected answers from TabularMCQ rows marked with `[ColumnLabel]`
2. Compares student selections against expected answers
3. Returns CORRECT if all rows match, INCORRECT otherwise
4. Score = (correct rows) / (total graded rows)

## Grading Behavior

- **Graded mode**: Rows with `[answer]` suffix are graded
- **Survey mode**: Rows without answers return CORRECT (completed)
- **Partial credit**: Score is calculated as fraction correct

## State Fields

- `correct` — CORRECTNESS enum (CORRECT, INCORRECT, or UNGRADED)
- `message` — Feedback message (e.g., "2 of 3 correct")
- `score` — Numeric score from 0 to 1

## Related Blocks

- **TabularMCQ** — The input component
- **CapaProblem** — Problem container with submit button
