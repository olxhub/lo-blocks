# CapaProblem Block

Interactive problem container inspired by LON-CAPA and Open edX. Combines inputs, graders, and feedback into a complete assessment experience.

## Basic Usage

```xml
<CapaProblem id="addition">
  <NumericalGrader answer="4">
    <p>What is 2 + 2?</p>
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

```xml
<CapaProblem id="nested">
  <NumericalGrader answer="42">
    <p>What is the answer?</p>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

**Explicit targeting**: Use `target` when inputs can't be nested:

```xml
<CapaProblem id="explicit">
  <p>Enter numerator and denominator:</p>
  <NumberInput id="x" /> / <NumberInput id="y" />
  <RatioGrader answer="2" target="x,y" />
</CapaProblem>
```

## Numerical Problems

### Basic

```xml
<CapaProblem id="multiply">
  <NumericalGrader answer="56">
    <p>What is 7 × 8?</p>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

### With Tolerance

Accept answers within a range:

```xml
<NumericalGrader answer="3.14159" tolerance="0.01" />
<NumericalGrader answer="100" tolerance="5%" />
```

### Range Answers

Accept any value in a range:

```xml
<NumericalGrader answer="[0, 10]" />   <!-- 0 ≤ x ≤ 10 -->
<NumericalGrader answer="(0, 10)" />   <!-- 0 < x < 10 -->
```

### Complex Numbers

```xml
<NumericalGrader answer="3+4i" tolerance="0.1" />
```

## Multiple Choice

Use `Key` for correct answers, `Distractor` for wrong ones:

```xml
<CapaProblem id="planets">
  <KeyGrader>
    <p>Which planet is closest to the Sun?</p>
    <ChoiceInput>
      <Key>Mercury</Key>
      <Distractor>Venus</Distractor>
      <Distractor>Earth</Distractor>
      <Distractor>Mars</Distractor>
    </ChoiceInput>
  </KeyGrader>
</CapaProblem>
```

## Ratio/Fraction Problems

RatioGrader compares the ratio of two NumberInputs:

```xml
<CapaProblem id="fraction">
  <RatioGrader answer="0.75">
    <p>Express 0.75 as a fraction in lowest terms:</p>
    <NumberInput /> / <NumberInput />
  </RatioGrader>
</CapaProblem>
```

## Ordering Problems

```xml
<CapaProblem id="timeline">
  <SortableGrader>
    <p>Arrange in chronological order:</p>
    <SortableInput>
      <Markdown>World War I (1914)</Markdown>
      <Markdown>World War II (1939)</Markdown>
      <Markdown>Moon Landing (1969)</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

Grading algorithms: `exact`, `partial`, `adjacent`, `spearman`, `survey`

## HTML Content

For backwards compatibility with Open edX and LON-CAPA, HTML can be mixed with blocks:

```xml
<CapaProblem id="physics">
  <NumericalGrader answer="20" tolerance="0.5">
    <Markdown>
### Kinematics

A ball is dropped from height *h*. Using $g = 10 \text{ m/s}^2$:
    </Markdown>
    <BlockMath>v = \sqrt{2gh}</BlockMath>
    <p>If h = 20m, what is v?</p>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

This is sometimes necessary for complex layouts (dropdowns on images, input arrays via `<table>`, etc.), but **prefer native blocks when possible**. Native components provide accessibility, mobile support, i18n, semantic analytics, and versioning that raw HTML cannot.

## How It Works

1. **Parsing**: CapaProblem's parser walks child nodes, identifying inputs (`getValue`) and graders (`isGrader`)
2. **ID Assignment**: Auto-generates IDs like `problem_input_0`, `problem_grader_0`
3. **Wiring**: Graders receive `target` attribute pointing to their inputs
4. **Rendering**: Adds header and footer with auto-generated helper components
5. **Grading**: On submit, grader's `getValue()` collects input, `grader()` evaluates it

### Auto-Generated Components

CapaProblem renders several internal components automatically:

- **Header**: Problem title + `Correctness` indicator (✅❌❔)
- **Footer**: `CapaButton` containing:
  - `ActionButton` - triggers grading
  - `Correctness` - icon showing result
  - `StatusText` - displays grader's `message` field

These internal components use `target` to find and display state from graders.

### Grader State

Graders maintain two fields that drive the UI:
- `correct` - CORRECTNESS enum (CORRECT, INCORRECT, INVALID, UNSUBMITTED, etc.)
- `message` - Feedback text shown to student

## Background

The name comes from LON-CAPA (Learning Online Network - Computer-Assisted Personalized Approach), which pioneered computer-based STEM assessment in the 1990s. Open edX adopted similar XML markup. This implementation provides compatible semantics with a cleaner component model.
