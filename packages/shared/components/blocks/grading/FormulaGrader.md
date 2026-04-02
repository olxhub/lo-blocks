# FormulaGrader

Grades symbolic math formulas by evaluating the student's expression and the expected answer at random sample points and checking that they agree. Any algebraically equivalent form is accepted.

```olx:playground
<CapaProblem id="demo" title="Normalized Learning Gain">
  <FormulaGrader answer="(post - pre) / (1 - pre)" samples="pre,post@0.1,0.2:0.8,0.95#10">
    <Markdown>Hake (1998) defined the *normalized learning gain* as the ratio of actual gain to maximum possible gain. If `pre` and `post` are pre- and post-test scores (as fractions), write the formula for normalized gain.</Markdown>
    <FormulaInput variables="pre,post" placeholder="e.g. (post - pre) / ..." />
  </FormulaGrader>
</CapaProblem>
```

## Properties

- `answer` (required): The expected formula as a math expression
- `samples` (required): Variable ranges and sample count (see Samples Format below)
- `tolerance` (optional): Numeric tolerance for comparison (default: 0.001% relative)
- `caseSensitive` (optional): Whether variable/function names are case-sensitive

## Samples Format

The `samples` attribute specifies which variables to sample, their ranges, and how many points to test:

```
variable@min:max#count
```

Multiple variables use comma-separated values:

```
x@-5:5#10              single variable, 10 points in [-5, 5]
x,y@-5,-5:5,5#10      two variables, both in [-5, 5]
pre,post@0.1,0.2:0.8,0.95#10   different ranges per variable
```

Choose ranges that avoid singularities in the expected answer. For example, if the answer contains `1/(1-x)`, don't include `x=1` in the range.

## How It Works

FormulaGrader evaluates both the student's formula and the expected answer at each sample point. If the results agree within tolerance at every point, the answer is marked correct.

This means any algebraically equivalent expression is accepted. For the normalized gain example above, all of these would be graded correct:

- `(post - pre) / (1 - pre)`
- `1 - (1 - post) / (1 - pre)`
- `post/(1-pre) - pre/(1-pre)`

## Examples

### Simple: Single Variable

```olx:playground
<CapaProblem id="kinematic" title="Kinematic Equation">
  <FormulaGrader answer="v0 + a*t" samples="v0,a,t@-10,-5,0:10,5,10#10">
    <Markdown>Write the formula for velocity as a function of time, given initial velocity `v0` and constant acceleration `a`.</Markdown>
    <FormulaInput variables="v0,a,t" />
  </FormulaGrader>
</CapaProblem>
```

### With Tolerance

```olx:code
<FormulaGrader answer="x^2 + 2*x + 1" samples="x@-5:5#10" tolerance="0.01">
```

### Case-Sensitive Variables

When problems use both upper- and lower-case versions of the same letter (e.g., `N` for population size and `n` for sample size):

```olx:playground
<CapaProblem id="sampling" title="Finite Population Correction">
  <FormulaGrader answer="sqrt((N - n) / (N - 1))" samples="N,n@20,2:200,50#10" caseSensitive="true">
    <Markdown>Write the finite population correction factor in terms of population size `N` and sample size `n`.</Markdown>
    <FormulaInput variables="N,n" caseSensitive="true" />
  </FormulaGrader>
</CapaProblem>
```

### Built-in Functions

The evaluator supports standard math functions that students can use in their answers:

- **Trig:** `sin`, `cos`, `tan`, `sec`, `csc`, `cot` and their inverses (`arcsin`, etc.)
- **Hyperbolic:** `sinh`, `cosh`, `tanh` and their inverses
- **Other:** `sqrt`, `ln`, `log10`, `log2`, `exp`, `abs`, `factorial`
- **Constants:** `pi`, `e`, `i`, `j`
- **Operators:** `+`, `-`, `*`, `/`, `^`, `||` (parallel resistor)

## When to Use FormulaGrader

FormulaGrader works by **sampling** — it plugs random numbers into each variable independently and checks that both sides produce the same result. This is powerful but has inherent constraints.

**Good fit:**

- "Write the formula for X in terms of Y and Z" — where any equivalent algebraic form is acceptable and the variables are independent quantities
- Physics/math problems where the answer is a symbolic expression: velocity, acceleration, circuit equations, probability formulas
- Problems where students may rearrange, factor, or distribute terms differently

**Poor fit:**

- **Form-sensitive questions** ("Factor this expression", "Simplify this expression") — the grader only checks equivalence, not form. A student who restates the original unfactored expression gets full credit. A student who gives a correct factored form also gets credit, but the grader can't *require* the factored form.

- **Dependent variables** — if variables have relationships between them (e.g., area `A = l*w`), the grader samples `A`, `l`, and `w` independently. The expression `A` and the expression `l*w` would evaluate to different values at most sample points, so the grader would reject a correct answer. There is no way to specify constraints between variables.

- **Multiple representations of the same quantity** — closely related to the above. If a student writes `F` where you expected `m*a`, sampling assigns unrelated random values to `F`, `m`, and `a`, so `F` and `m*a` won't match, even though they're physically the same.

For form-sensitive problems, consider a CustomGrader with structural checks. For dependent-variable problems, ensure the answer and the expected expression use the same independent variables.

## Compatible Inputs

**FormulaInput** provides a math expression text field with live LaTeX preview. Any input that returns a string also works (e.g., `LineInput`), but without the preview.

## Related Blocks

- **NumericalGrader**: For numeric (not symbolic) answers
- **FormulaInput**: Text input with live LaTeX preview
- **CustomGrader**: For problems requiring structural or form-based checking
