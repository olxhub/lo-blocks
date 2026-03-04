# ActionButton

A clickable button that triggers actions on child components. When clicked, it finds and executes all action blocks (graders, LLMActions, etc.) nested inside it.

```olx:playground
<Vertical id="feedback_demo">
  <Markdown>Explain how cognitive load theory applies to instructional design:</Markdown>
  <TextArea id="response" rows="4" placeholder="Cognitive load theory suggests..." />
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      A student is learning about cognitive load theory. Provide specific, constructive feedback on their explanation. If they mention intrinsic, extraneous, or germane load correctly, acknowledge it. If there are gaps, suggest what they might add:
      <Ref target="response" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

## Properties
- `label` (required): Button text to display
- `dependsOn` (optional): State language expression that must be truthy for the button to be enabled. See [State Language Expressions](../../../lib/stateLanguage/expr.pegjs.md) for syntax.

## State
- `isDisabled`: Whether the button is currently disabled

## Action Discovery

Actions must be **children** of ActionButton, not siblings:

```olx:code
<!-- CORRECT: Action is a child -->
<ActionButton label="Get Feedback">
  <LLMAction target="feedback">...</LLMAction>
</ActionButton>

<!-- WRONG: Action is a sibling - won't be found -->
<LLMAction target="feedback">...</LLMAction>
<ActionButton label="Get Feedback" />
```

## Common Use Cases

### Trigger Grading

```olx:playground
<Vertical id="grading_demo">
  <Markdown>According to Bloom's revised taxonomy, how many cognitive levels are there?</Markdown>
  <NumberInput id="answer" />
  <ActionButton label="Check Answer">
    <NumericalGrader id="grader" target="answer" answer="6" />
  </ActionButton>
  <Correctness target="grader" />
</Vertical>
```

Note the wiring: `NumericalGrader` targets the input (`answer`) to get its value, and `Correctness` targets the grader (`grader`) to display its `correct` state. `CapaProblem` handles this wiring automatically.

### Multiple Parallel Analyses

```olx:playground
<Vertical id="multi_demo">
  <Markdown>Write a brief learning objective for a lesson on photosynthesis:</Markdown>
  <TextArea id="objective" rows="2" placeholder="Students will be able to..." />
  <LLMFeedback id="bloom_feedback" />
  <LLMFeedback id="measurable_feedback" />
  <ActionButton label="Analyze Objective">
    <LLMAction target="bloom_feedback">
      Identify which level of Bloom's taxonomy this learning objective addresses (Remember, Understand, Apply, Analyze, Evaluate, or Create):
      <Ref target="objective" />
    </LLMAction>
    <LLMAction target="measurable_feedback">
      Evaluate whether this learning objective is measurable. Does it use an observable action verb? How could it be improved?
      <Ref target="objective" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

### Conditional Enable

Use state language expressions to enable/disable the button based on component state:

```olx:playground
<Vertical id="conditional_demo">
  <Markdown>Describe Piaget's stages of cognitive development:</Markdown>
  <TextArea id="essay" rows="3" placeholder="Start typing..." />
  <LLMFeedback id="fb" />
  <ActionButton label="Submit for Feedback" dependsOn="@essay.value">
    <LLMAction target="fb">
      Evaluate this description of Piaget's stages. Check for accuracy and completeness:
      <Ref target="essay" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

More complex conditions are also supported:

```olx:code
<!-- Enable when essay has at least 50 words -->
<ActionButton label="Submit" dependsOn="wordcount(@essay.value) >= 50">

<!-- Enable when quiz is answered correctly -->
<ActionButton label="Continue" dependsOn="@quiz.correct === correctness.correct">
```

## Related Blocks
- **NumericalGrader**: Grades numerical responses when triggered
- **KeyGrader**: Grades multiple choice when triggered
- **LLMAction**: Executes LLM prompts when triggered
- **LLMFeedback**: Displays LLM responses
- **CapaProblem**: Provides automatic Check button for graded problems
