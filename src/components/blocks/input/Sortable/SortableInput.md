# SortableInput Block

## Overview

The SortableInput block provides a drag-and-drop interface for ordering items. Students can rearrange items by dragging them to create a sequence.

## Technical Usage

### Basic Syntax
```xml
<SortableInput id="sorting">
  <Markdown id="item1">First item</Markdown>
  <Markdown id="item2">Second item</Markdown>
  <Markdown id="item3">Third item</Markdown>
</SortableInput>
```

### Properties
- `id` (required): Unique identifier for the input

### State Fields
- `arrangement`: Current order of items as array of indices

### getValue
Returns an object with:
- `arrangement`: Array representing current item order

## Pedagogical Purpose

Sortable interactions support sequencing tasks, but can be a bit brittle, since small errors can lead to incorrect answers. There are many grading schemes for how to manage slightly-out-of-order inputs. As such, it's helpful, but often a bit subtle.

It's also nice in surveys!

## Common Use Cases

### Process Steps
```xml
<Markdown>Arrange the steps of the water cycle:</Markdown>
<SortableInput id="water_cycle">
  <Markdown id="evap">Evaporation</Markdown>
  <Markdown id="cond">Condensation</Markdown>
  <Markdown id="precip">Precipitation</Markdown>
  <Markdown id="collect">Collection</Markdown>
</SortableInput>
<SortableGrader target="water_cycle" />
```

### Timeline Events
Arrange historical events chronologically.

### Priority Ranking
Order factors by importance or impact.

## Related Blocks
- **SortableGrader**: Grades arrangements with various algorithms
- **SimpleSortable**: Shorthand syntax using PEG format

## Example File
See `SortableInput.olx` or `Sortable.md` for working examples.
