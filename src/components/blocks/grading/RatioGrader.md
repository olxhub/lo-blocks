# RatioGrader

Grades ratio/fraction answers by comparing two numeric inputs. Accepts any equivalent ratio.

## Usage

Works with any two inputs that output numbers:

```olx:code
<CapaProblem id="effect_size" title="Learning Gains Ratio">
  <RatioGrader answer="2.0" displayAnswer="2 and 1">
    In Hake's study, interactive engagement produced roughly how many times the learning gain of traditional lecture?

    Ratio (IE gain : Traditional gain):
    <NumberInput /> : <NumberInput />
  </RatioGrader>
</CapaProblem>
```

## Properties

- `answer` (required): Expected ratio as decimal (first ÷ second)
- `tolerance` (optional): Acceptable deviation (absolute or `%`)
- `displayAnswer` (recommended): Text shown for Show Answer (e.g., "2 and 1")

## How It Works

RatioGrader divides the first input by the second:

- `answer="2.0"` (ratio 2:1)
- Inputs 48, 24 → 48÷24 = 2.0 ✓
- Inputs 0.48, 0.24 → 2.0 ✓
- Inputs 50, 23 → 2.17 (may need tolerance)

## Compatible Inputs

Any inputs returning numbers: `NumberInput`, `ComplexInput`, etc.

## Known Limitations

**Show Answer:** Without `displayAnswer`, shows the ratio value next to each input (e.g., "0.5" for both), which is misleading since entering 0.5 in both gives ratio 1, not 0.5. Always use `displayAnswer` to provide clear guidance (e.g., `displayAnswer="1 and 2"`).

