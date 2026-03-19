# BlockMath

Renders LaTeX mathematical equations as centered, block-level elements. Displays equations prominently, typically on their own line, suitable for important formulas and equations.

## Syntax

```olx:code
<BlockMath id="cronbach">
\alpha = \frac{k}{k-1}\left(1 - \frac{\sum_{i=1}^{k} \sigma^2_{Y_i}}{\sigma^2_X}\right)
</BlockMath>
```

### Shorthand Syntax (XML validation disabled only)

```olx:code
<$$>d = \frac{M_1 - M_2}{SD_{pooled}}</$$>
```

**Note:** The shorthand `<$$>` syntax only works when XML validation is disabled, as `$$` is not a valid XML tag name.

## Properties
- `id` (optional): Unique identifier for the block

## LaTeX Support

BlockMath uses KaTeX for rendering and supports standard LaTeX math notation including:
- Fractions (`\frac{a}{b}`)
- Square roots (`\sqrt{x}`)
- Subscripts and superscripts (`x_i`, `x^2`)
- Greek letters (`\alpha`, `\beta`, `\gamma`)
- Matrices and arrays
- Summations and integrals (`\sum`, `\int`)
- Trigonometric functions (`\sin`, `\cos`, `\tan`)

## Common Use Cases

### Cronbach's Alpha

Cronbach's Alpha measures internal consistency reliability - how well a set of items measure the same construct. Values above 0.7 are generally acceptable; above 0.9 may indicate redundancy.

```olx:playground
<BlockMath id="cronbachs_alpha">
\alpha = \frac{k}{k-1}\left(1 - \frac{\sum_{i=1}^{k} \sigma^2_{Y_i}}{\sigma^2_X}\right)
</BlockMath>
```

### Cohen's d

Cohen's d quantifies effect size as the standardized difference between two means. Values of 0.2, 0.5, and 0.8 are conventionally interpreted as small, medium, and large effects.

```olx:playground
<BlockMath id="cohens_d">
d = \frac{M_{treatment} - M_{control}}{SD_{pooled}}
</BlockMath>
```

### IRT: 3-Parameter Logistic Model

The 3PL model predicts the probability of a correct response given ability (θ). Parameters: *a* = discrimination (slope), *b* = difficulty (location), *c* = pseudo-guessing (lower asymptote).

```olx:playground
<BlockMath id="irt_3pl">
P(\theta) = c + (1-c)\frac{1}{1 + e^{-a(\theta - b)}}
</BlockMath>
```

## Related Blocks
- **InlineMath**: For equations within flowing text

