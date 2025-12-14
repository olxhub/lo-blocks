# Explanation Block

Displays explanation content conditionally based on grader state. Compatible with Open edX CAPA `[explanation]` blocks.

## Basic Usage

```xml
<CapaProblem id="physics" title="Kinematics">
  <NumericalGrader answer="20">
    <p>A ball drops from 20m. What is its final velocity? (g=10 m/s²)</p>
    <NumberInput />
    <Explanation>
      Using v² = 2gh, we get v = √(2 × 10 × 20) = 20 m/s
    </Explanation>
  </NumericalGrader>
</CapaProblem>
```

**Important:** Explanation must be nested inside the grader (like inputs). It auto-targets the containing grader.

By default, the explanation appears only after the learner answers correctly.

## showWhen Attribute

Control when the explanation appears:

| Value | Behavior |
|-------|----------|
| `correct` (default) | Show only after correct answer |
| `answered` | Show after any submission |
| `always` | Always visible (useful for debugging) |
| `never` | Never visible (hidden) |

```xml
<NumericalGrader answer="42">
  <p>What is the answer?</p>
  <NumberInput />
  <!-- Show explanation after any attempt -->
  <Explanation showWhen="answered">
    The answer involves the power rule...
  </Explanation>
</NumericalGrader>

<!-- Always visible (for development) -->
<NumericalGrader answer="100">
  <p>Debug problem</p>
  <NumberInput />
  <Explanation showWhen="always">
    Debug: This explanation is always shown
  </Explanation>
</NumericalGrader>
```

## Multiple Graders

In problems with multiple graders, nest each Explanation inside its grader:

```xml
<CapaProblem id="multi">
  <NumericalGrader id="part_a" answer="4">
    <p>Part A: What is 2+2?</p>
    <NumberInput />
    <Explanation>Explanation for Part A.</Explanation>
  </NumericalGrader>

  <NumericalGrader id="part_b" answer="9">
    <p>Part B: What is 3×3?</p>
    <NumberInput />
    <Explanation>Explanation for Part B.</Explanation>
  </NumericalGrader>
</CapaProblem>
```

## Rich Content

Explanations support any block content:

```xml
<NumericalGrader answer="20">
  <p>Calculate the velocity.</p>
  <NumberInput />
  <Explanation>
    <Markdown>
### Solution

The formula is $v = \sqrt{2gh}$
    </Markdown>
    <BlockMath>v = \sqrt{2 \times 10 \times 20} = 20</BlockMath>
  </Explanation>
</NumericalGrader>
```

## Styling

The component uses these CSS classes:
- `lo-explanation` - Outer container
- `lo-explanation__header` - Title/heading
- `lo-explanation__content` - Content area

Default styling shows a blue-highlighted box with left border.

## Open edX Compatibility

This block provides functional compatibility with Open edX `[explanation]` markdown:

**Open edX markdown:**
```
[explanation]
The answer is 2x because...
[/explanation]
```

**lo-blocks OLX equivalent:**
```xml
<NumericalGrader answer="2x">
  <p>What is the derivative of x²?</p>
  <TextInput />
  <Explanation>The answer is 2x because...</Explanation>
</NumericalGrader>
```
