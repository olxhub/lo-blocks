# ComplexInput Block

## Overview

The ComplexInput block provides a validated text input for complex numbers, accepting both `i` and `j` notation commonly used in mathematics and engineering.

## Technical Usage

### Basic Syntax
```xml
<ComplexInput id="answer" />
```

### Properties
- `id` (recommended): Unique identifier for the input
- `placeholder` (optional): Hint text

### Input Validation
Accepts characters: `0-9`, `.`, `e`, `+`, `-`, `i`, `j`

Valid inputs:
- `3+4i`
- `2.5-1.2j`
- `1e-3+2e-4i`
- `5i`
- `-3.14`

### State Fields
- `value`: The current complex number string

## Notes

ComplexInput supports:

1. **Engineering Notation**: Supports both `i` (math) and `j` (engineering) notation
2. **Scientific Precision**: Handles exponential notation
3. **Input Validation**: Prevents invalid characters
4. **Domain-Specific**: Purpose-built for complex number problems

## Common Use Cases

### Graded Problems

For graded problems, use inside CapaProblem with a grader:

```xml
<CapaProblem id="complex_problem">
  <NumericalGrader answer="5-i">
    <p>Calculate (2 + 3i) × (1 - i):</p>
    <ComplexInput />
  </NumericalGrader>
</CapaProblem>
```

### Circuit Analysis

```xml
<CapaProblem id="impedance_problem">
  <NumericalGrader answer="100+50i" tolerance="1">
    <p>What is the impedance of a circuit with R=100Ω and XL=50Ω?</p>
    <ComplexInput placeholder="e.g., 100+50j" />
  </NumericalGrader>
</CapaProblem>
```

## Example File
See `ComplexInput.olx` for working examples.
