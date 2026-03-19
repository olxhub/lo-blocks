# ComplexInput

Validated text input for complex numbers, accepting both `i` and `j` notation commonly used in mathematics and engineering.

## Syntax

```olx:code
<ComplexInput id="answer" />
```

## Properties
- `id` (recommended): Unique identifier for the input
- `placeholder` (optional): Hint text

## Input Validation

Accepts characters: `0-9`, `.`, `e`, `+`, `-`, `i`, `j`

Valid inputs:
- `3+4i`
- `2.5-1.2j`
- `1e-3+2e-4i`
- `5i`
- `-3.14`

## State Fields
- `value`: The current complex number string

## Notes

ComplexInput supports:

1. **Engineering Notation**: Supports both `i` (math) and `j` (engineering) notation
2. **Scientific Precision**: Handles exponential notation
3. **Input Validation**: Prevents invalid characters
4. **Domain-Specific**: Purpose-built for complex number problems

## Common Use Cases

### Graded Problems

```olx:playground
<CapaProblem id="complex_problem" title="Complex Multiplication">
  <NumericalGrader answer="5-i">
    Calculate (2 + 3i) × (1 - i):
    <ComplexInput />
  </NumericalGrader>
</CapaProblem>
```

### Circuit Analysis

```olx:playground
<CapaProblem id="impedance" title="Circuit Impedance">
  <NumericalGrader answer="100+50j" tolerance="1">
    What is the impedance of a circuit with R=100Ω and X_L=50Ω?
    <ComplexInput placeholder="e.g., 100+50j" />
  </NumericalGrader>
</CapaProblem>
```

