# SortableInput

Drag-and-drop interface for ordering items. Students can rearrange items by dragging them to create a sequence.

```olx:playground
<CapaProblem id="sorting_demo" title="Ordering Task">
  <SortableGrader>
    <Markdown>Arrange these learning strategies by their effect size (highest to lowest) according to Dunlosky et al. (2013):</Markdown>
    <SortableInput id="strategies">
      <Markdown id="item1">Practice testing (0.70)</Markdown>
      <Markdown id="item2">Distributed practice (0.60)</Markdown>
      <Markdown id="item3">Elaborative interrogation (0.40)</Markdown>
      <Markdown id="item4">Highlighting (0.20)</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

## Properties
- `id` (required): Unique identifier for the input

## State Fields
- `arrangement`: Current order of items as array of indices

## getValue
Returns an object with:
- `arrangement`: Array representing current item order

## Pedagogical Purpose

Sortable interactions support sequencing tasks, but can be a bit brittle, since small errors can lead to incorrect answers. There are many grading schemes for how to manage slightly-out-of-order inputs. As such, it's helpful, but often a bit subtle.

It's also nice in surveys!

## Common Use Cases

### Process Steps

```olx:playground
<CapaProblem id="process_order" title="Learning Process">
  <SortableGrader>
    <Markdown>Arrange these steps of effective learning in order:</Markdown>
    <SortableInput id="learning_steps">
      <Markdown id="encode">Encoding - initial exposure to information</Markdown>
      <Markdown id="store">Storage - consolidation during sleep</Markdown>
      <Markdown id="retrieve">Retrieval - actively recalling information</Markdown>
      <Markdown id="apply">Application - using knowledge in new contexts</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### Timeline Events

Arrange historical events chronologically (e.g., key PER milestones).

### Priority Ranking

Order factors by importance or impact.

## Related Blocks
- **SortableGrader**: Grades arrangements with various algorithms
- **SimpleSortable**: Shorthand syntax using PEG format

