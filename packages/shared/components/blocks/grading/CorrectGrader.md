# CorrectGrader

Always-correct grader for surveys and ungraded activities. Marks any submission as correct regardless of input.

```olx:playground
<CapaProblem id="survey" title="Survey">
  Which topics interest you most? (Select all that apply)
  <CorrectGrader>
    <CheckboxInput>
      <Key id="a">History</Key>
      <Key id="b">Science</Key>
      <Key id="c">Literature</Key>
    </CheckboxInput>
  </CorrectGrader>
</CapaProblem>
```

## When to Use

Use CorrectGrader when:
- Collecting survey responses where any answer is valid
- Activities that need a submit button but no grading
- Gating progress on submission without judging correctness

## Works with Any Input

CorrectGrader is input-agnostic. It works with CheckboxInput, ChoiceInput, LineInput, TextArea, or any other input block.

```olx:playground
<CapaProblem id="reflection" title="Reflection">
  What stood out to you in this reading?
  <CorrectGrader>
    <TextArea rows="3" />
  </CorrectGrader>
</CapaProblem>
```

## Related Blocks

- **DefaultGrader**: Similar but supports custom score and feedback attributes
- **KeyGrader**: Grades single-select choices by Key vs Distractor
- **CheckboxGrader**: Grades multi-select choices by Key vs Distractor
