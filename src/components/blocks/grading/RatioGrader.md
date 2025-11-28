# RatioGrader

Grades ratio/fraction answers by comparing two numeric inputs. Accepts any equivalent ratio.

## Usage

Works with any two inputs that output numbers:

```xml
<CapaProblem id="fraction">
  <RatioGrader answer="0.75">
    <p>Express 3/4 as a fraction:</p>
    <NumberInput /> / <NumberInput />
  </RatioGrader>
</CapaProblem>
```

## Properties

- `answer` (required): Expected ratio as decimal (first ÷ second)
- `tolerance` (optional): Acceptable deviation (absolute or `%`)

## How It Works

RatioGrader divides the first input by the second:

- `answer="0.5"` (ratio 1:2)
- Inputs 2, 4 → 2÷4 = 0.5 ✓
- Inputs 3, 6 → 3÷6 = 0.5 ✓
- Inputs 2, 3 → 2÷3 = 0.667 ✗

## Compatible Inputs

Any inputs returning numbers: `NumberInput`, `ComplexInput`, etc.
