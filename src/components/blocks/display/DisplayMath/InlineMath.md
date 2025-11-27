# InlineMath Block

## Overview

The InlineMath block renders LaTeX mathematical expressions inline within text. Unlike BlockMath, it does not create a separate line, making it suitable for referencing variables and short expressions within paragraphs.

## Technical Usage

### Basic Syntax
```xml
<InlineMath>x = 5</InlineMath>
```

### Shorthand Syntax
```xml
<$>x = 5</$>
```

### Properties
- `id` (optional): Unique identifier for the block

### LaTeX Support
InlineMath supports the same LaTeX notation as BlockMath:
- Variables (`x`, `y`, `\alpha`)
- Simple expressions (`x + y = z`)
- Subscripts and superscripts (`x_i`, `n^2`)
- Greek letters (`\pi`, `\theta`)
- Functions (`f(x)`, `\sin x`)

## Usage Notes

InlineMath is a standalone block element. To mix text and math, alternate between Markdown and InlineMath blocks:

```xml
<Markdown>The value of </Markdown><$>\pi</$><Markdown> is approximately 3.14159.</Markdown>
```

## Related Blocks
- **BlockMath** / **\<$$\>**: For prominent, centered equations

## Example File
See `InlineMath.olx` for working examples.
