# NumericalGrader

Grades numeric answers with support for tolerance, ranges, and complex numbers.

```olx:playground
<CapaProblem id="demo">
  <NumericalGrader answer="2" tolerance="0.05">
    <Markdown>In Hake's study, interactive engagement produced roughly how many times the learning gains of traditional lecture?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

## Properties

- `answer` (required): Expected value, range, or complex number
- `tolerance` (optional): Acceptable deviation (absolute or percentage)

## Usage Patterns

Works with any input that outputs a number:

```olx:playground
<CapaProblem id="effect_size">
  <NumericalGrader answer="0.5" tolerance="0.02">
    <Markdown>Calculate Cohen's d: Treatment M=85, Control M=80, SD=10</Markdown>
    <NumberInput placeholder="d = " />
  </NumericalGrader>
</CapaProblem>
```

## Tolerance

Accept approximate answers:

```olx:code
<NumericalGrader answer="100" />                 <!-- exact -->
<NumericalGrader answer="100" tolerance="1" />   <!-- 99-101 -->
<NumericalGrader answer="100" tolerance="5%" />  <!-- 95-105 -->
```

Example with tolerance:

```olx:playground
<CapaProblem id="pi_problem">
  <NumericalGrader answer="3.14159" tolerance="0.01">
    <Markdown>What is π to at least 2 decimal places?</Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

## Range Answers

Accept any value in a range (useful for estimation problems):

```olx:code
<NumericalGrader answer="[10, 20]" />   <!-- 10 ≤ x ≤ 20 -->
<NumericalGrader answer="(10, 20]" />   <!-- 10 < x ≤ 20 -->
```

```olx:playground
<CapaProblem id="estimate">
  <NumericalGrader answer="[45, 55]">
    <Markdown>Freeman's meta-analysis found active learning reduced failure rates by approximately what percentage?</Markdown>
    <NumberInput placeholder="%" />
  </NumericalGrader>
</CapaProblem>
```

## Physics Example

```olx:playground
<CapaProblem id="physics">
  <NumericalGrader answer="20" tolerance="0.5">
    <Markdown>
A ball is dropped from rest. After falling for 2 seconds (using g = 10 m/s²), what is its velocity in m/s?
    </Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

## Complex Numbers

For complex number answers:

```olx:code
<NumericalGrader answer="3+4i" tolerance="0.1" />
```

## Compatible Inputs

Any input that returns a number: `NumberInput`, `ComplexInput`, or future inputs like sliders, number lines, etc.
