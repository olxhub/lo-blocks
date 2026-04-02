# FormulaInput

Text input for math expressions with a live LaTeX-rendered preview. As the student types, the expression is parsed and displayed as formatted mathematics.

```olx:playground
<Vertical id="formula_demo">
  <Markdown>Enter a math expression:</Markdown>
  <FormulaInput id="expr" variables="x,y" placeholder="e.g. x^2 + 2*x + 1" />
</Vertical>
```

## Properties

- `variables` (optional): Comma-separated variable names allowed in expressions (e.g. `"x,y,z"`)
- `functions` (optional): Comma-separated custom function names (e.g. `"f,g"`)
- `caseSensitive` (optional): Whether names are case-sensitive (default: false)
- `placeholder` (optional): Hint text displayed when empty
- `trailingText` (optional): Text shown after the input (e.g. units)
- `size` (optional): Input width in characters

## Supported Syntax

Students can enter expressions using standard math notation:

- **Arithmetic:** `+`, `-`, `*`, `/`, `^`
- **Parentheses:** `(x + 1) * (x - 1)`
- **Functions:** `sin(x)`, `sqrt(x)`, `ln(x)`, `log10(x)`, `exp(x)`, `abs(x)`
- **Constants:** `pi`, `e`, `i`, `j`
- **Scientific notation:** `6.02e23`, `1.6e-19`
- **Parallel operator:** `R1 || R2` (computes 1/(1/R1 + 1/R2))

## Common Use Cases

### Graded Formula Problem

```olx:playground
<CapaProblem id="spearman_brown" title="Spearman-Brown Formula">
  <FormulaGrader answer="n*r / (1 + (n-1)*r)" samples="n,r@2,0.1:10,0.9#10">
    <Markdown>The Spearman-Brown prophecy formula predicts the reliability of a test lengthened by factor `n`, given original reliability `r`. Write the formula.</Markdown>
    <FormulaInput variables="n,r" placeholder="reliability = ..." />
  </FormulaGrader>
</CapaProblem>
```

### With Trailing Units

```olx:code
<FormulaInput variables="m,a" trailingText="N" placeholder="force = ..." />
```

### Case-Sensitive

When the problem distinguishes upper- and lower-case variables:

```olx:code
<FormulaInput variables="N,n,p" caseSensitive="true" />
```

## State Fields

- `value`: The current expression string entered by the student

## Related Blocks

- **FormulaGrader**: Sampling-based formula equivalence grading
- **LineInput**: Plain text input (no preview)
- **NumberInput**: Numeric input
