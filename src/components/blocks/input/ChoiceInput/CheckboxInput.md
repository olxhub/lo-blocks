# CheckboxInput

Multi-select (checkbox) input for questions with multiple correct answers.

## Minimal Template

```xml
<CapaProblem id="checkbox_minimal">
  <CheckboxGrader>
    <p>Select all correct answers:</p>
    <CheckboxInput>
      <Key>Correct 1</Key>
      <Key>Correct 2</Key>
      <Distractor>Wrong 1</Distractor>
    </CheckboxInput>
  </CheckboxGrader>
</CapaProblem>
```

## Examples

### All-or-Nothing Grading (default)

Student must select ALL Keys and NO Distractors:

```xml
<CapaProblem id="checkbox_allornone">
  <CheckboxGrader>
    <p>Which are gas giants?</p>
    <CheckboxInput>
      <Key>Jupiter</Key>
      <Key>Saturn</Key>
      <Distractor>Earth</Distractor>
      <Distractor>Mars</Distractor>
    </CheckboxInput>
  </CheckboxGrader>
</CapaProblem>
```

### Partial Credit

Add `partialCredit="true"` for n/m scoring:

```xml
<CapaProblem id="checkbox_partial">
  <CheckboxGrader partialCredit="true">
    <p>Select symptoms of dehydration (partial credit):</p>
    <CheckboxInput>
      <Key>Thirst</Key>
      <Key>Dark urine</Key>
      <Key>Fatigue</Key>
      <Distractor>Runny nose</Distractor>
    </CheckboxInput>
  </CheckboxGrader>
</CapaProblem>
```

Score formula: `(keys selected - distractors selected) / total keys`, clamped to [0,1].

### With Custom Values

Use `value` attribute for analytics/state:

```xml
<CheckboxInput id="checkbox_values">
  <Key value="opt_a">Option A</Key>
  <Key value="opt_b">Option B</Key>
  <Distractor value="opt_c">Option C</Distractor>
</CheckboxInput>
```

## How It Works

1. `CheckboxInput` collects selections as an array
2. `CheckboxGrader` counts Keys and Distractors selected
3. Returns CORRECT, INCORRECT, or PARTIALLY_CORRECT

## Related Blocks

- `ChoiceInput` + `KeyGrader` - for single-select (radio) questions
- `Key` - marks correct answers
- `Distractor` - marks wrong answers
