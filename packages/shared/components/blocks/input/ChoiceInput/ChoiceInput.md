# ChoiceInput

Creates multiple choice questions using Key (correct) and Distractor (incorrect) options. Renders as radio buttons for single-selection.

```olx:playground
<CapaProblem id="scaffolding" title="Instructional Strategies">
  <KeyGrader>
    <Markdown>Which instructional strategy involves breaking complex tasks into smaller, manageable steps with temporary support?</Markdown>
    <ChoiceInput>
      <Distractor>Direct instruction</Distractor>
      <Key>Scaffolding</Key>
      <Distractor>Discovery learning</Distractor>
      <Distractor>Rote memorization</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## Properties
- `id` (recommended): Unique identifier for the input

## Child Blocks
- **Key**: Correct answer option(s) - supports optional `value` attribute
- **Distractor**: Incorrect answer options - supports optional `value` attribute

## State
- `value`: The selected option's value

## API (locals)
- `getChoices()`: Returns array of all options with `{ id, tag, value }` for each

## Pedagogical Purpose

Multiple choice assessments offer:

1. **Quick Assessment**: Rapid evaluation of understanding
2. **Diagnostic Value**: Well-designed distractors reveal common misconceptions
3. **Objective Grading**: Clear right/wrong determination
4. **Scaffolding**: Can guide learners toward correct thinking through obvious questions

## Common Use Cases

### Conceptual Understanding

```olx:playground
<CapaProblem id="zpd" title="Zone of Proximal Development">
  <KeyGrader>
    <Markdown>A student can solve basic algebra problems alone but needs teacher help with word problems. According to Vygotsky, word problems are in the student's:</Markdown>
    <ChoiceInput>
      <Distractor>Comfort zone</Distractor>
      <Key>Zone of proximal development</Key>
      <Distractor>Frustration zone</Distractor>
      <Distractor>Mastery zone</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### Diagnostic Distractors

Well-crafted distractors reveal misconceptions:

```olx:playground
<CapaProblem id="hake" title="Hake's Study">
  <KeyGrader>
    <Markdown>In Hake's 1998 study of 6,000 physics students, what was the approximate normalized gain for interactive engagement vs. traditional lecture?</Markdown>
    <ChoiceInput>
      <Distractor>Both showed gains around 0.25</Distractor>
      <Key>IE: ~0.48, Traditional: ~0.23</Key>
      <Distractor>IE: ~0.23, Traditional: ~0.48</Distractor>
      <Distractor>No significant difference was found</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

### Using value= with UseDynamic

The `value` attribute on Key/Distractor sets the reference value, useful with `UseDynamic` to show content based on selection:

```olx:playground
<Vertical id="adaptive">
  <ChoiceInput id="topic_picker">
    <Key id="choice_behav" value="behaviorist_content">Behaviorism</Key>
    <Distractor id="choice_cog" value="cognitive_content">Cognitivism</Distractor>
  </ChoiceInput>

  <UseDynamic target="behaviorist_content" targetRef="topic_picker" />

  <Hidden>
    <Markdown id="behaviorist_content">**Behaviorism** focuses on observable behaviors and external stimuli, as studied by Skinner and Pavlov.</Markdown>
    <Markdown id="cognitive_content">**Cognitivism** focuses on internal mental processes like memory and problem-solving.</Markdown>
  </Hidden>
</Vertical>
```

## Related Blocks
- **Key**: Marks correct answer(s)
- **Distractor**: Marks incorrect answers
- **KeyGrader**: Grades based on Key selection
- **UseDynamic**: Can display content based on selection
