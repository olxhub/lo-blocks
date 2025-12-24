# NumberInput

Input field optimized for numerical values. Parses input to floating-point numbers for use with numerical graders.

```olx:playground
<CapaProblem id="demo" title="Attrition Rate">
  <NumericalGrader answer="35">
    <Markdown>A study has 100 participants. If 35 drop out, what is the attrition rate (as a percentage)?</Markdown>
    <NumberInput placeholder="%" />
  </NumericalGrader>
</CapaProblem>
```

## Properties
- `label` (optional): Label text displayed with the input
- `placeholder` (optional): Hint text when empty

## State
- `value`: Current value (stored as string, parsed to float on getValue)

## getValue
Returns a floating-point number parsed from the input, or `undefined` if empty.

## Common Use Cases

### Calculation Problems

```olx:playground
<CapaProblem id="calculation" title="Test Score Proportion">
  <NumericalGrader answer="0.2" tolerance="0.01">
    <Markdown>
A student takes a 50-item test and gets 40 correct.

What proportion did they get wrong?
    </Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

### With Tolerance for Estimation

```olx:playground
<CapaProblem id="estimation" title="Testing Effect">
  <NumericalGrader answer="10" tolerance="0.5">
    <Markdown>
In Roediger & Butler's study, students who were tested retained material for about how many times longer than those who restudied?

(Round to the nearest whole number)
    </Markdown>
    <NumberInput />
  </NumericalGrader>
</CapaProblem>
```

### Multiple Inputs with RatioGrader

```olx:playground
<CapaProblem id="ratio" title="Learning Gains Ratio">
  <RatioGrader answer="0.5">
    <Markdown>Express the ratio of traditional to interactive learning gains (0.23 to 0.48) as a fraction in lowest terms:</Markdown>
    <NumberInput id="num" placeholder="numerator" /> / <NumberInput id="denom" placeholder="denominator" />
  </RatioGrader>
</CapaProblem>
```

### Data Collection (Ungraded)

For surveys, experiments, or data collection without automated grading:

```olx:playground
<Vertical id="survey">
  <Markdown>How many hours did you study for the last exam?</Markdown>
  <NumberInput id="study_hours" placeholder="hours" />
  <Markdown>What score did you get (0-100)?</Markdown>
  <NumberInput id="score" placeholder="score" />
</Vertical>
```

## Related Blocks
- **ComplexInput**: Numeric input with complex number support
- **NumericalGrader**: Grades numerical responses with tolerance
- **RatioGrader**: Grades ratios using two inputs
- **CapaProblem**: Container for graded problems
