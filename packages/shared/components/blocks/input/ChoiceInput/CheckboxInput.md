# CheckboxInput and CheckboxGrader

Multi-select (checkbox) input for questions with multiple correct answers.

```olx:playground
<CapaProblem id="study_strategies" title="Study Strategies">
  <CheckboxGrader>
    <Markdown>Which of these are "high utility" study strategies according to Dunlosky et al. (2013)?</Markdown>
    <CheckboxInput>
      <Key>Practice testing</Key>
      <Key>Distributed practice</Key>
      <Distractor>Highlighting</Distractor>
      <Distractor>Rereading</Distractor>
    </CheckboxInput>
  </CheckboxGrader>
</CapaProblem>
```

## Examples

### All-or-Nothing Grading (default)

Student must select ALL Keys and NO Distractors:

```olx:playground
<CapaProblem id="desirable_difficulties" title="Desirable Difficulties">
  <CheckboxGrader>
    Which of these are "desirable difficulties" according to Bjork &amp; Bjork (2011)?
    <CheckboxInput>
      <Key>Varying the conditions of practice</Key>
      <Key>Spacing study or practice sessions</Key>
      <Key>Generation effects</Key>
      <Key>Using tests as learning events</Key>
      <Distractor>Rereading notes multiple times</Distractor>
      <Distractor>Highlighting key passages</Distractor>
    </CheckboxInput>
    <Explanation><Markdown>
Bjork, E. L., &amp; Bjork, R. A. (2011). [Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning.](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf) In M. A. Gernsbacher, R. W. Pew, L. M. Hough, &amp; J. R. Pomerantz (Eds.), *Psychology and the real world: Essays illustrating fundamental contributions to society* (pp. 56-64). Worth Publishers.
    </Markdown></Explanation>
  </CheckboxGrader>
</CapaProblem>
```

### Partial Credit

Add `partialCredit="true"` for n/m scoring:

```olx:playground
<CapaProblem id="testing_effect" title="Testing Effect">
  <CheckboxGrader partialCredit="true">
    <Markdown>Select findings from Roediger &amp; Karpicke's research (partial credit):</Markdown>
    <CheckboxInput>
      <Key>Practice tests improve retention more than restudying</Key>
      <Key>The benefit increases over longer retention intervals</Key>
      <Key>Even unsuccessful retrieval attempts improve learning</Key>
      <Distractor>Massed practice is more efficient for long-term learning</Distractor>
    </CheckboxInput>
  </CheckboxGrader>
</CapaProblem>
```

Score formula: `(keys selected - distractors selected) / total keys`, clamped to [0,1].

### With Custom Values

Use `value` attribute for analytics/state:

```olx:code
<CheckboxInput id="checkbox_values">
  <Key value="testing">Practice testing</Key>
  <Key value="spacing">Distributed practice</Key>
  <Distractor value="highlighting">Highlighting</Distractor>
</CheckboxInput>
```

### With Codes

Each option may carry a numeric `code` — the number the response is
**recorded** as. Read the checked options' codes back with `@inputId.codes`:
an array, in the order the learner checked them, empty when nothing is checked.

```olx:code
<CheckboxInput id="symptom_checklist">
  <Key id="symptom_checklist_focus" value="lost_focus" code="1">I lost focus</Key>
  <Key id="symptom_checklist_blank" value="went_blank" code="2">I went blank</Key>
  <Key id="symptom_checklist_none" value="none" code="0">None of these</Key>
</CheckboxInput>
```

> **A code is not a score.** `code` is the survey-methodology sense of the
> word — the SPSS code, the Qualtrics "recode value" — not a grade, not
> points, and not partial credit. Checkbox *grading* is `CheckboxGrader`'s
> job and is entirely separate; a `Distractor` may carry a code exactly as a
> `Key` may.

An option with no `code` falls back to the default-code table documented in
[ChoiceInput.md](ChoiceInput.md#default-codes) (`true`/`yes` → 1,
`strongly_agree` → 2, and so on); a value the table does not know has no code.
A checked option with no code at all is **omitted** from `codes` rather than
left as a hole, so `codes` can be shorter than `value` — which keeps a sum of
codes a sum of what is actually coded. A code must be a finite number;
anything else is a parse error.

## How It Works

1. `CheckboxInput` collects selections as an array
2. `CheckboxGrader` counts Keys and Distractors selected
3. Returns CORRECT, INCORRECT, or PARTIALLY_CORRECT

## Related Blocks

- `ChoiceInput` + `KeyGrader` - for single-select (radio) questions
- `Key` - marks correct answers
- `Distractor` - marks wrong answers

Blueprint note: `CheckboxInput` exposes `value` (the checked values) and
`codes` (their codes). `ChoiceInput`, being single-select, exposes `value` and
`code`.

