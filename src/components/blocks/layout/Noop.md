# Noop Block

## Overview

The Noop (No Operation) block is an invisible container that renders its children without adding any visual styling or wrapper elements. It's useful for grouping blocks logically without affecting layout. This is mostly used internally to lo-blocks.

## Technical Usage

### Basic Syntax
```xml
<Noop>
  <Markdown>First child</Markdown>
  <Markdown>Second child</Markdown>
</Noop>
```

### Properties
- `id` (optional): Unique identifier

### Child Blocks
Any block can be a child. Children are rendered directly without additional wrapping.

## Pedagogical Purpose

This block has no pedagogical purpose. It's primarily a system-level component.

## Common Use Cases

### Grouping for Reference
```xml
<Noop id="reusable_prompt">
  <Markdown>Instructions that appear in multiple places</Markdown>
  <Image src="diagram.png" alt="Reference diagram" />
</Noop>

<Ref target="reusable_prompt" />
```

### Semantic Organization
```xml
<Noop id="question_group_1">
  <!-- All Q1 related blocks -->
</Noop>
<Noop id="question_group_2">
  <!-- All Q2 related blocks -->
</Noop>
```

### Internal Implementation
Many graders and processors use Noop as their component since they don't need visual output:
```javascript
component: _Noop  // Standard pattern for non-visual blocks
```

## Related Blocks
- **Hidden**: Hides children completely (not rendered)
- **Vertical**: Adds vertical layout styling

## Example File
See `Noop.olx` for working examples.
