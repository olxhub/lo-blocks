# InlineMath

Renders LaTeX mathematical expressions inline. Unlike BlockMath, it does not create a separate line.

```olx:playground
<InlineMath id="example">\alpha = 0.85</InlineMath>
```

## Properties
- `id` (optional): Unique identifier for the block

## LaTeX Support

InlineMath supports the same LaTeX notation as BlockMath:
- Variables (`x`, `y`, `\alpha`)
- Simple expressions (`x + y = z`)
- Subscripts and superscripts (`x_i`, `n^2`)
- Greek letters (`\pi`, `\theta`)
- Functions (`f(x)`, `\sin x`)

## Usage Notes

InlineMath is a standalone block element. To mix text and math inline, use Markdown's built-in math support with `$...$` for inline and `$$...$$` for display:

```olx:playground
<Markdown id="mixed_math">
With a sample size of $n = 100$ and effect size $d = 0.5$, the statistical power is approximately 80%.
</Markdown>
```

## Related Blocks
- **BlockMath**: For prominent, centered equations

