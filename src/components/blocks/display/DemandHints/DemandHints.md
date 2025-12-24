# DemandHints

Sequential hint display that reveals hints one at a time as the student requests them.

```olx:playground
<CapaProblem id="hint_demo" title="Power Rule">
  What is the derivative of x²?
  <StringGrader answer="2x" ignoreCase="true">
    <LineInput />
  </StringGrader>
  <DemandHints>
    <Hint>Think about the power rule: d/dx(xⁿ) = n·xⁿ⁻¹</Hint>
    <Hint>For x², we have n=2</Hint>
    <Hint>The answer is 2x</Hint>
  </DemandHints>
</CapaProblem>
```

## Usage

DemandHints is typically used inside CapaProblem, which automatically provides the hint button in its footer. See [CapaProblem](../../CapaProblem/CapaProblem.md) for full grading examples.

## Related Blocks
- **Hint**: Individual hint content
- **Explanation**: Shows after problem is answered correctly
