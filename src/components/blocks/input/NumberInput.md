# NumberInput Block

## Overview

The NumberInput block provides an input field optimized for numerical values. It parses input to floating-point numbers and can be used with numerical graders for math and science questions.

## Technical Usage

### Basic Syntax
```xml
<NumberInput id="answer" label="Enter your answer:" />
```

### Properties
- `id` (recommended): Unique identifier for the input
- `label` (optional): Label text displayed with the input
- `placeholder` (optional): Hint text when empty

### State Fields
- `value`: The current numerical value (stored as string, parsed to float on getValue)

### getValue
Returns a floating-point number parsed from the input, or `undefined` if empty.

## Common Use Cases

### Graded Problems

For graded problems, use inside CapaProblem with a grader:

```xml
<CapaProblem id="speed_problem">
  <NumericalGrader answer="60" tolerance="0.1">
    <p>A car travels 120 km in 2 hours. What is its average speed in km/h?</p>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

### Data Collection

For surveys or data collection (no grading):

```xml
<Markdown>Enter the measured voltage (V):</Markdown>
<NumberInput id="voltage" />
```

## Related Blocks
- **ComplexInput**: Alternative numeric input with complex number support
- **NumericalGrader**: Grades numerical responses with tolerance
- **RatioGrader**: Grades ratios using two inputs
- **CapaProblem**: Container for graded problems

## Example File
See `NumberInput.olx` for working examples.
