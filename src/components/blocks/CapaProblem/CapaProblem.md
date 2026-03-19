# CapaProblem

Interactive problem container inspired by LON-CAPA and Open edX. Combines inputs, graders, and feedback into a complete assessment experience.

```olx:playground
<CapaProblem id="demo" title="Basic Arithmetic">
  <NumericalGrader answer="4">
    <Markdown>What is 2 + 2?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

CapaProblem automatically:
- Assigns IDs to child inputs and graders
- Wires inputs to their corresponding graders
- Adds a Check button and correctness indicator
- Displays feedback after submission

## Inputs and Graders

Inputs and graders communicate through a simple interface: inputs provide values via `getValue()`, graders consume those values. They're decoupled by data type, not component type.

### Numeric Graders

`NumericalGrader` accepts any input that returns a number:

| Input | Description |
|-------|-------------|
| `NumberInput` | Text field for numeric entry |
| `ChoiceInput` | Dropdown or radio returning numeric value |
| (future) Slider, NumberLine, etc. | Any component returning a number |

### Common Pairs

| Input | Grader | Use Case |
|-------|--------|----------|
| `NumberInput` | `NumericalGrader` | Numeric answers |
| `NumberInput` × 2 | `RatioGrader` | Fractions, ratios |
| `ChoiceInput` | `KeyGrader` | Multiple choice |
| `SortableInput` | `SortableGrader` | Ordering tasks |
| `LineInput` | (custom) | Text answers |

This decoupling means you can swap inputs without changing graders. A numeric slider and a text input can both feed `NumericalGrader`.

### Wiring Inputs to Graders

**Nesting (preferred)**: Graders find inputs among their children:

```olx:playground
<CapaProblem id="nested" title="Ultimate Answer">
  <NumericalGrader answer="42">
    <Markdown>According to Douglas Adams, what is the answer to life, the universe, and everything?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

**Explicit targeting**: Use `target` when inputs can't be nested:

```olx:playground
<CapaProblem id="explicit" title="Fraction Entry">
  <Markdown>Express 1/2 as a fraction:</Markdown>
  <NumberInput id="x" /> / <NumberInput id="y" />
  <RatioGrader answer="0.5" target="x,y" />
</CapaProblem>
```

## Numerical Problems

### With Tolerance

Accept answers within a range:

```olx:playground
<CapaProblem id="pi" title="Value of Pi">
  <NumericalGrader answer="3.14159" tolerance="0.01">
    <Markdown>What is pi to at least two decimal places?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

### Range Answers

Accept any value in a range:

```olx:code
<NumericalGrader answer="[0, 10]" />   <!-- 0 ≤ x ≤ 10 -->
<NumericalGrader answer="(0, 10)" />   <!-- 0 < x < 10 -->
```

## Multiple Choice

Use `Key` for correct answers, `Distractor` for wrong ones:

```olx:playground
<CapaProblem id="mcq" title="Learning Theorists">
  <KeyGrader>
    <Markdown>Which learning theorist emphasized the importance of "scaffolding" in the zone of proximal development?</Markdown>
    <ChoiceInput>
      <Distractor>B.F. Skinner</Distractor>
      <Key>Lev Vygotsky</Key>
      <Distractor>Jean Piaget</Distractor>
      <Distractor>John Watson</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## Ratio/Fraction Problems

RatioGrader compares the ratio of two NumberInputs:

```olx:playground
<CapaProblem id="fraction" title="Fraction as Ratio">
  <RatioGrader answer="0.75">
    <Markdown>Express 3/4 as a fraction:</Markdown>
    <NumberInput /> / <NumberInput />
  </RatioGrader>
</CapaProblem>
```

## Ordering Problems

```olx:playground
<CapaProblem id="timeline" title="Psychology Milestones">
  <SortableGrader>
    <Markdown>Arrange these educational psychology milestones chronologically:</Markdown>
    <SortableInput>
      <Markdown>Thorndike's Law of Effect (1898)</Markdown>
      <Markdown>Piaget's Stages of Development (1936)</Markdown>
      <Markdown>Bloom's Taxonomy (1956)</Markdown>
      <Markdown>Vygotsky's ZPD translated to English (1978)</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

Grading algorithms: `exact`, `partial`, `adjacent`, `spearman`, `survey`

## Rich Content

Problems can include math, markdown, and complex layouts. For backwards compatibility with Open edX and LON-CAPA, raw HTML can be mixed with blocks. This is sometimes necessary for complex layouts (dropdowns on images, input arrays via `<table>`, etc.), but **prefer native blocks when possible**. Native components provide accessibility, mobile support, i18n, semantic analytics, and versioning that raw HTML cannot.

```olx:playground
<CapaProblem id="physics" title="Kinematics">
  <NumericalGrader answer="20" tolerance="0.5">
    <Markdown>
### Kinematics

A ball is dropped from height *h*. Using g = 10 m/s²:
    </Markdown>
    <BlockMath>v = \sqrt{2gh}</BlockMath>
    <Markdown>If h = 20m, what is v (in m/s)?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

## How It Works

1. **Parsing**: CapaProblem's parser walks child nodes, identifying inputs (`getValue`) and graders (`isGrader`)
2. **ID Assignment**: Auto-generates IDs like `problem_input_0`, `problem_grader_0`
3. **Wiring**: Graders receive `target` attribute pointing to their inputs
4. **Rendering**: Adds header and footer with auto-generated helper components
5. **Grading**: On submit, grader's `getValue()` collects input, `grader()` evaluates it

### Auto-Generated Components

CapaProblem renders several internal components automatically:

- **Header**: Problem title + `Correctness` indicator
- **Footer**: `CapaButton` containing:
  - `ActionButton` - triggers grading
  - `Correctness` - icon showing result
  - `StatusText` - displays grader's `message` field

### Grader State

Graders maintain two fields that drive the UI:
- `correct` - CORRECTNESS enum (CORRECT, INCORRECT, INVALID, UNSUBMITTED, etc.)
- `message` - Feedback text shown to student

## History

The name "CAPA" comes from LON-CAPA (Learning Online Network - Computer-Assisted Personalized Approach), a system developed by Gerd Kortemeyer at Michigan State University that pioneered computer-based STEM assessment starting in the 1990s.

When Open edX was built at MIT, Piotr Mitros adapted CAPA's problem markup into what became OLX (Open Learning XML), working closely with Kortemeyer who was visiting MIT at the time. OLX 1.0 cleaned up some of LON-CAPA's historical quirks while preserving its core semantics.

This implementation continues that evolution: a further cleanup with a modern component model, while maintaining conceptual compatibility. The progression is LON-CAPA XML → Open edX OLX 1.0 → lo-blocks OLX 2.0, each step tightening the design while preserving the fundamental insight that assessment markup should be declarative and composable.
