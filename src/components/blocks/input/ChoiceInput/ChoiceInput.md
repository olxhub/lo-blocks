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
- **Key**: Correct answer option(s) - supports optional `value` attribute
- **Distractor**: Incorrect answer options - supports optional `value` attribute

### State Fields
- `value`: The selected option's value (either the `value` attribute or the option's ID)

### API (locals)
- `getChoices()`: Returns array of all options with `{ id, tag, value }` for each

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

### Using value= with UseDynamic

The `value` attribute on Key/Distractor sets the reference in redux and learning analytics, which would otherwise be auto-assigned (numeric position) or the ID. This is especially helpful when we want this to overlap with an existing ID, without ID conflicts. For example, with `UseDynamic`, we might use a ChoiceInput to select an ID:

```xml
<ChoiceInput id="topic_picker">
  <Key id="choice_math" value="math_content">Mathematics</Key>
  <Distractor id="choice_sci" value="science_content">Science</Distractor>
</ChoiceInput>

<UseDynamic target="math_content" targetRef="topic_picker" />

<Hidden>
  <Markdown id="math_content">Math details...</Markdown>
  <Markdown id="science_content">Science details...</Markdown>
</Hidden>
```

This pattern avoids ID conflicts: the choices have their own IDs (`choice_math`, etc.) while their `value` attributes point to content IDs (`math_content`, etc.).

## Related Blocks
- **Key**: Marks correct answer(s)
- **Distractor**: Marks incorrect answers
- **KeyGrader**: Grades based on Key selection
- **UseDynamic**: Can display content based on ChoiceInput selection

## Example File
See `ChoiceInput.olx` for working examples.
