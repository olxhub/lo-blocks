# KeyGrader

Grades multiple choice by checking if a `Key` (correct) or `Distractor` (incorrect) was selected.

```olx:playground
<CapaProblem id="spacing_effect" title="Spacing Effect">
  <KeyGrader>
    <Markdown>According to Cepeda et al., what is the optimal spacing interval relative to the retention interval?</Markdown>
    <ChoiceInput>
      <Distractor>1-2%</Distractor>
      <Key>10-20%</Key>
      <Distractor>50-60%</Distractor>
      <Distractor>Same length as retention interval</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## How It Works

1. Gets selected option from `ChoiceInput`
2. Checks if it's a `Key` or `Distractor`
3. Returns CORRECT or INCORRECT

## Related Blocks

- `ChoiceInput` - collects the selection
- `Key` - marks correct answer(s)
- `Distractor` - marks wrong answers

