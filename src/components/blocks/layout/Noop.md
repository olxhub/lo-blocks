# Noop

**System-Level Block**

The Noop (No Operation) block is an invisible container that renders its children without adding any visual styling or wrapper elements. It's useful for grouping blocks logically without affecting layout. This is mostly used internally by lo-blocks.

## Syntax

```olx:playground
<Noop id="noop_demo">
  <Markdown>First child</Markdown>
  <Markdown>Second child</Markdown>
</Noop>
```

## Properties
- `id` (optional): Unique identifier

## Child Blocks

Any block can be a child. Children are rendered directly without additional wrapping.

## Common Use Cases

### Grouping for Reference

```olx:playground
<Noop id="reusable_content">
  <Markdown>Instructions that appear in multiple places.</Markdown>
  <Markdown>This content is grouped but has no visual wrapper.</Markdown>
</Noop>
```

### Semantic Organization

```olx:code
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

