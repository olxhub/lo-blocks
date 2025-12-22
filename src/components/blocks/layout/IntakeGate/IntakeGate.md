# IntakeGate

Gates content behind an intake process. Collects input, shows a loading state while processing, then reveals generated content.

## Why IntakeGate Exists

Traditional educational content is static: all students see the same problems and examples. Research shows that personalization improves engagement and learning outcomes. When word problems reference students' actual interests (basketball, cooking, video games), students engage more deeply with the underlying concepts.

IntakeGate enables a powerful pattern: **gather information about the learner, then dynamically generate personalized content**. The intake phase collects preferences, prior knowledge, or context. The system processes this (typically via LLM), then reveals content tailored to that specific learner.

This mirrors effective tutoring. A good tutor asks questions first ("What are you interested in?", "What do you already know about this?") before launching into instruction. IntakeGate brings this adaptive pattern to scalable digital content.

## Basic Usage

```xml
<IntakeGate targets="output_slot">
  <!-- First child: intake form -->
  <Vertical>
    <TextArea id="user_input" />
    <ActionButton label="Generate">
      <LLMAction target="output_slot">
        Create content based on: <Ref>user_input</Ref>
      </LLMAction>
    </ActionButton>
  </Vertical>

  <!-- Second child: revealed after generation -->
  <Vertical>
    <TextSlot id="output_slot" />
  </Vertical>
</IntakeGate>
```

## How It Works

IntakeGate has exactly two children and three phases:

1. **Intake phase**: Shows the first child (form, questions, etc.)
2. **Loading phase**: Shows a spinner while LLM generates content
3. **Content phase**: Shows the second child with populated TextSlots

The `targets` attribute lists TextSlot IDs to watch. When all targets have values, the gate opens.

## Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `targets` | Yes | Comma-separated list of TextSlot IDs to watch |

## Pedagogical Applications

### Personalized Word Problems

The motivating use case. Students enter an interest, then receive math problems recontextualized around that interest. The underlying mathematics stays fixed (ensuring valid assessment), but the narrative changes.

From Walkington (2013): students who received personalized algebra problems showed significantly better transfer to novel problems compared to those receiving generic versions.

```xml
<IntakeGate targets="problem_context">
  <Vertical>
    <Markdown>What topic interests you?</Markdown>
    <TextArea id="interest" />
    <ActionButton label="Generate Problems">
      <LLMAction target="problem_context">
        Rewrite this problem for someone interested in <Ref>interest</Ref>:
        "A worker charges $80 base fee plus $50/hour..."
        Keep the numbers identical. Change only the context.
      </LLMAction>
    </ActionButton>
  </Vertical>

  <CapaProblem>
    <TextSlot id="problem_context" />
    <p>Which equation represents total cost (y) for hours worked (x)?</p>
    <KeyGrader>
      <ChoiceInput>
        <Key>y = 50x + 80</Key>
        <Distractor>y = 80x + 50</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>
</IntakeGate>
```

### Adaptive Explanations

Adjust explanation complexity based on stated background:

```xml
<IntakeGate targets="explanation">
  <Vertical>
    <Markdown>How familiar are you with calculus?</Markdown>
    <ChoiceInput id="background">
      <Choice>Never studied it</Choice>
      <Choice>Took a course years ago</Choice>
      <Choice>Use it regularly</Choice>
    </ChoiceInput>
    <ActionButton label="Continue">
      <LLMAction target="explanation">
        Explain derivatives to someone with this background: <Ref>background</Ref>
        Adjust terminology and examples appropriately.
      </LLMAction>
    </ActionButton>
  </Vertical>

  <Vertical>
    <TextSlot id="explanation" />
  </Vertical>
</IntakeGate>
```

### Scenario Generation

Generate case studies or scenarios based on student-provided context:

```xml
<IntakeGate targets="case_study">
  <Vertical>
    <Markdown>What field do you work in or plan to enter?</Markdown>
    <TextArea id="field" />
    <ActionButton label="Generate Case Study">
      <LLMAction target="case_study">
        Create a brief ethics case study relevant to: <Ref>field</Ref>
        Include a dilemma with competing considerations.
      </LLMAction>
    </ActionButton>
  </Vertical>

  <Vertical>
    <TextSlot id="case_study" />
    <TextArea id="response" placeholder="How would you handle this situation?" />
  </Vertical>
</IntakeGate>
```

## Multiple TextSlots

IntakeGate can watch multiple targets. Content reveals only when all are populated:

```xml
<IntakeGate targets="context_1,context_2,context_3">
  <!-- Intake with multiple LLMActions -->
  <ActionButton label="Generate All">
    <LLMAction target="context_1">...</LLMAction>
    <LLMAction target="context_2">...</LLMAction>
    <LLMAction target="context_3">...</LLMAction>
  </ActionButton>

  <!-- Content with multiple slots -->
  <Sequential>
    <TextSlot id="context_1" />
    <TextSlot id="context_2" />
    <TextSlot id="context_3" />
  </Sequential>
</IntakeGate>
```

## Design Considerations

**Keep intake lightweight.** Long forms before content creates friction. Ask only what's needed for meaningful personalization.

**Validate the pattern.** Personalization should serve learning, not novelty. The Walkington research worked because interest-based contexts helped students see the relevance of abstract math. Arbitrary personalization ("Here's a problem about Taylor Swift") without pedagogical purpose may distract rather than help.

**Fixed assessments, flexible contexts.** For valid assessment, keep the underlying structure constant. Change the narrative wrapper, not the mathematical relationships or answer options.

## Technical Notes

IntakeGate watches TextSlot `value` and `state` fields. It transitions to loading when any target's LLM starts running, and to content when all targets have non-empty values.

The block currently checks `LLM_STATUS.RUNNING` specifically. A future "Doneness" abstraction would allow gating on any completion state (problem correctness, form validation, etc.).

## Related Blocks

- **TextSlot**: Target for generated content
- **LLMAction**: Generates content and writes to TextSlot
- **ActionButton**: Triggers LLMAction execution
- **Ref**: References input values in LLM prompts

## References

Arslan, B., Lehman, B., Tenison, C., Sparks, J. R., López, A. A., Gu, L., & Zapata-Rivera, D. (2024). Opportunities and challenges of using generative AI to personalize educational assessment. *Frontiers in Artificial Intelligence*, 7, 1460651.

Arslan, B., Wilschut, T., van Rijn, H., & van der Velde, M. (2024). Evidence-Based Dynamic Personalization for Learning and Assessment Tools (ED-PLAT): Machine- and Learner-Driven Adaptation to Support All Learners. *International Conference on Artificial Intelligence in Education*, 477-491.

Walkington, C. A. (2013). Using adaptive learning technologies to personalize instruction to student interests: The impact of relevant contexts on performance and learning outcomes. *Journal of Educational Psychology*, 105(4), 932-945.
