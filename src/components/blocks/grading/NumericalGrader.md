# NumericalGrader

Grades numeric answers with support for tolerance, ranges, and complex numbers.

## Usage

Works with any input that outputs a number:

```xml
<CapaProblem id="with_number_input">
  <NumericalGrader answer="42">
    <p>What is 6 × 7?</p>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

```xml
<CapaProblem id="with_complex_input">
  <NumericalGrader answer="5">
    <p>What is |3 + 4i|?</p>
    <ComplexInput />
  </NumericalGrader>
</CapaProblem>
```

## Properties

- `answer` (required): Expected value, range, or complex number
- `tolerance` (optional): Acceptable deviation (absolute or percentage)

## Tolerance

```xml
<NumericalGrader answer="100" />                 <!-- exact -->
<NumericalGrader answer="100" tolerance="1" />   <!-- 99-101 -->
<NumericalGrader answer="100" tolerance="5%" />  <!-- 95-105 -->
```

## Range Answers

Accept any value in a range:

```xml
<NumericalGrader answer="[10, 20]" />   <!-- 10 ≤ x ≤ 20 -->
<NumericalGrader answer="(10, 20]" />   <!-- 10 < x ≤ 20 -->
```

## Complex Numbers

```xml
<NumericalGrader answer="3+4i" tolerance="0.1" />
```

## Compatible Inputs

Any input that returns a number: `NumberInput`, `ComplexInput`, or future inputs like sliders, number lines, etc.
