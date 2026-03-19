# SimpleSortable

Shorthand syntax for sortable exercises. Expands to CapaProblem + SortableGrader + SortableInput.

```olx:playground
<SimpleSortable id="spacing" title="Spaced Practice">
According to the research on spaced practice, arrange these study schedules from least to most effective for long-term retention:
===
1. Cramming the night before the exam
2. Studying in two sessions, one day apart
3. Studying in three sessions, spread over a week
4. Studying in four sessions, spread over a month
</SimpleSortable>
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

SimpleSortable expands into:
- `{id}_problem` - CapaProblem container
- `{id}_prompt` - Markdown instructions
- `{id}_input` - SortableInput with drag-and-drop
- `{id}_grader` - SortableGrader for scoring
- `{id}_item_N` - Individual item blocks

## Pedagogical Applications

Ordering tasks assess understanding of sequences, processes, and relationships:

```olx:playground
<SimpleSortable id="memory" title="Memory Processes">
Arrange these memory processes in the order they typically occur:
===
1. Encoding - information enters memory
2. Consolidation - memory stabilizes during sleep
3. Storage - information maintained over time
4. Retrieval - accessing stored information
</SimpleSortable>
```

### Historical/Scientific Sequences

```olx:playground
<SimpleSortable id="per_history" title="PER Milestones">
Arrange these physics education research milestones chronologically:
===
1. Halloun &amp; Hestenes develop Force Concept Inventory (1985)
2. Hake's 6000-student study comparing traditional vs. interactive (1998)
3. Freeman meta-analysis confirms active learning benefits (2014)
</SimpleSortable>
```

### Process Understanding

```olx:playground
<SimpleSortable id="worked_example" title="Faded Worked Examples">
Put the steps of creating a faded worked example in order:
===
1. Present a complete worked example
2. Present example with one step missing for student to complete
3. Present example with multiple steps missing
4. Student solves entire problem independently
</SimpleSortable>
```

## External Files

For longer or reusable content:

```olx:code
<SimpleSortable id="planets" title="Planets" src="planets.sortpeg" />
```

## Related Blocks

- **SortableInput** - Lower-level sorting without auto-grading
- **SortableGrader** - Grades arrangements
- **CapaProblem** - Problem container with submit button
