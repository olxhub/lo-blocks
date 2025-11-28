# SimpleSortable

Shorthand syntax for sortable exercises. Expands to CapaProblem + SortableGrader + SortableInput.

## Usage

```xml
<SimpleSortable id="planets">
Order the planets by distance from the Sun:
===
1. Mercury
2. Venus
3. Earth
4. Mars
</SimpleSortable>
```

Or with external file:

```xml
<SimpleSortable id="planets" src="planets.sortpeg" />
```

## Syntax

```
Prompt text here (can include Markdown)
===
1. First item (correct position)
2. Second item
3. Third item
```

- Prompt section before the `===` separator
- Numbered items define the correct order
- Items are automatically shuffled when presented to students

## Generated Structure

SimpleSortable expands into multiple blocks:
- `{id}_problem` - CapaProblem container
- `{id}_prompt` - Markdown instructions
- `{id}_input` - SortableInput with drag-and-drop
- `{id}_grader` - SortableGrader for scoring
- `{id}_item_N` - Individual item blocks

## Pedagogical Applications

Ordering tasks assess understanding of sequences, processes, and relationships. Common in standardized tests for evaluating procedural knowledge (scientific method, historical chronology, mathematical steps). The format lets authors write items in correct order—more natural than specifying shuffle positions—while students see them randomized.

## Related Blocks

- **SortableInput** - Lower-level sorting without auto-grading
- **SortableGrader** - Grades arrangements
- **CapaProblem** - Problem container with submit button
