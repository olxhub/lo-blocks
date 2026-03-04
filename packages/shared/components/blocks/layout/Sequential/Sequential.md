# Sequential

Step-by-step learning experiences where learners navigate through content in sequence. Learners can skip around, but the structure encourages linear progression.

```olx:playground
<Sequential id="worked_example">
  <Vertical label="Problem">
    <Markdown>
**Worked Example: Calculating Effect Size**

A study compares two teaching methods. The treatment group (n=30) scores M=78, SD=12. The control group (n=30) scores M=72, SD=10.

Calculate Cohen's d.
    </Markdown>
  </Vertical>
  <Vertical label="Step 1">
    <Markdown>
**Step 1: Calculate the pooled standard deviation**

Formula: SD_pooled = √[(SD₁² + SD₂²) / 2]

SD_pooled = √[(12² + 10²) / 2] = √[(144 + 100) / 2] = √122 ≈ 11.05
    </Markdown>
  </Vertical>
  <Vertical label="Step 2">
    <Markdown>
**Step 2: Calculate Cohen's d**

d = (M₁ - M₂) / SD_pooled = (78 - 72) / 11.05 = 6 / 11.05 ≈ **0.54**

This is a "medium" effect size.
    </Markdown>
  </Vertical>
</Sequential>
```

## Properties
- `id` (required): Unique identifier for the sequence

## State
- Navigation handled automatically with prev/next controls
- Current step `index` persisted to preserve learner progress

## Pedagogical Purpose

Sequential supports several evidence-based strategies:

1. **Worked examples**: Breaking complex procedures into steps reduces cognitive load (Sweller, 1988). Faded worked examples, where later steps require more student work, are particularly effective.

2. **Scaffolded problem-solving**: Providing support on early steps, then gradually removing it, improves transfer.

3. **Interleaved testing**: Integrating retrieval practice between content sections leverages the testing effect.

## Common Use Cases

### Faded Worked Examples

Research shows transitioning from worked examples to practice is more effective than either alone:

```olx:playground
<Sequential id="fading">
  <Vertical label="Full Example">
    <Markdown>
**Peer Instruction Effect Size**

Hake's study: Traditional g=0.23, Interactive g=0.48

Normalized gain increase: 0.48 - 0.23 = 0.25

This represents a **109% improvement** in learning gains.
    </Markdown>
  </Vertical>
  <Vertical label="Guided Practice">
    <Markdown>
**Your Turn (with scaffolding)**

Freeman's meta-analysis found active learning reduced failure rates from 34% to 22%.
    </Markdown>
    <Markdown>Calculate the relative reduction in failure rate:</Markdown>
    <NumberInput id="reduction" placeholder="Relative reduction %" />
    <Collapsible id="hint" title="Hint">
      <Markdown>Relative reduction = (34 - 22) / 34 × 100</Markdown>
    </Collapsible>
  </Vertical>
  <Vertical label="Independent Practice">
    <Markdown>
**Now on your own**

A study finds pre-testing improves final exam scores from 68% to 74%. Calculate the absolute and relative improvement.
    </Markdown>
    <TextArea id="work" rows="3" placeholder="Show your work..." />
  </Vertical>
</Sequential>
```

### Spaced Retrieval Integration

Insert retrieval practice between content sections:

```olx:playground
<Sequential id="spaced">
  <Vertical label="Content">
    <Markdown>
**The Testing Effect**

Roediger &amp; Karpicke (2006) found that students who took a practice test retained 50% more material after one week than students who spent the same time restudying.

The key mechanism is that retrieval strengthens memory traces more than passive exposure.
    </Markdown>
  </Vertical>
  <Vertical label="Check Understanding">
    <Markdown>Without looking back, answer:</Markdown>
    <CapaProblem id="check" title="Testing Effect">
      <KeyGrader>
        <Markdown>In Roediger &amp; Karpicke's study, how much more material did the testing group retain?</Markdown>
        <ChoiceInput>
          <Distractor>25% more</Distractor>
          <Key>50% more</Key>
          <Distractor>100% more</Distractor>
          <Distractor>No difference</Distractor>
        </ChoiceInput>
      </KeyGrader>
    </CapaProblem>
  </Vertical>
  <Vertical label="Application">
    <Markdown>How could you apply this finding to your own studying?</Markdown>
    <TextArea id="application" rows="3" />
  </Vertical>
</Sequential>
```

### Predict-Observe-Explain

This sequence leverages the finding that making predictions improves subsequent learning:

```olx:playground
<Sequential id="poe">
  <Vertical label="Predict">
    <Markdown>
A ball is thrown straight up. At the very top of its path, what is its acceleration?
    </Markdown>
    <ChoiceInput id="prediction">
      <Distractor id="zero">Zero (it's momentarily at rest)</Distractor>
      <Distractor id="up">Upward (residual from throw)</Distractor>
      <Key id="down">Downward (gravity)</Key>
    </ChoiceInput>
  </Vertical>
  <Vertical label="Observe">
    <Markdown>
Watch the motion sensor data as we throw the ball...

**Result**: The acceleration is constant at 9.8 m/s² downward throughout the motion - even at the top.
    </Markdown>
  </Vertical>
  <Vertical label="Explain">
    <Markdown>If you predicted incorrectly, explain why the correct answer makes sense:</Markdown>
    <TextArea id="explain" rows="3" placeholder="The acceleration is constant because..." />
  </Vertical>
</Sequential>
```

## Related Blocks
- **Tabs**: Random access navigation
- **Navigator**: More complex navigation patterns
- **Collapsible**: Progressive disclosure within a step
