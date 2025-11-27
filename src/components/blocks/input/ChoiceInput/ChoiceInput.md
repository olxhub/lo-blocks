# ChoiceInput Block

## Overview

The ChoiceInput block creates multiple choice questions by collecting student selections from Key (correct) and Distractor (incorrect) child options. It renders as radio buttons for single-selection questions.

## Technical Usage

### Basic Syntax

Inside CapaProblem, the KeyGrader wraps the ChoiceInput:

```xml
<CapaProblem id="geography">
  <KeyGrader>
    <p>What is the capital of France?</p>
    <ChoiceInput>
      <Key>Paris</Key>
      <Distractor>London</Distractor>
      <Distractor>Berlin</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### Properties
- `id` (recommended): Unique identifier for the input

### Child Blocks
- **Key**: Correct answer option(s)
- **Distractor**: Incorrect answer options

### State Fields
- `value`: ID of the selected option

### getValue
Returns an object with:
- `value`: The selected option ID
- `choices`: Array of all options with their IDs and types

## Pedagogical Purpose

Multiple choice assessments offer:

1. **Quick Assessment**: Rapid evaluation of understanding
2. **Diagnostic Value**: Distractors reveal common misconceptions
3. **Objective Grading**: Clear right/wrong determination
4. **Scaffolding**: Can guide learners toward correct thinking, by asking obvious questions

## Common Use Cases

### Single Correct Answer

```xml
<CapaProblem id="capital_problem">
  <KeyGrader>
    <p>What is the capital of Italy?</p>
    <ChoiceInput>
      <Key>Rome</Key>
      <Distractor>Milan</Distractor>
      <Distractor>Venice</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### With Math Content

```xml
<CapaProblem id="formula_problem">
  <KeyGrader>
    <p>Which equation represents mass-energy equivalence?</p>
    <ChoiceInput>
      <Key><$>E = mc^2</$></Key>
      <Distractor><$>E = mc</$></Distractor>
      <Distractor><$>E = m^2c</$></Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## Related Blocks
- **Key**: Marks correct answer(s)
- **Distractor**: Marks incorrect answers
- **KeyGrader**: Grades based on Key selection

## Example File
See `ChoiceInput.olx` for working examples.
