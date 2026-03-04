# SortableGrader

Grades student arrangements in sortable exercises. Supports multiple grading algorithms for different assessment needs.

```olx:playground
<CapaProblem id="graded_sort" title="Research Timeline">
  <SortableGrader algorithm="exact">
    <Markdown>Put these physics education research milestones in chronological order:</Markdown>
    <SortableInput id="per_timeline">
      <Markdown>Force Concept Inventory developed (1985)</Markdown>
      <Markdown>Hake's 6000-student comparison study (1998)</Markdown>
      <Markdown>Freeman meta-analysis confirms active learning (2014)</Markdown>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

## Properties
- `id` (optional): Unique identifier
- `target` (optional): ID of SortableInput to grade (auto-inferred if not specified)
- `algorithm` (optional): Grading algorithm to use

## State Fields
- `correct`: Correctness status
- `message`: Feedback message

## Grading Algorithms

### exact (All-or-Nothing)

Full credit only for perfect order; zero otherwise.

**Use when:** The exact sequence is critical—following a recipe, executing a procedure, or establishing a causal chain where any error breaks the logic.

```olx:playground
<CapaProblem id="exact_demo" title="CPR Steps (exact)">
  Order the CPR steps correctly (any error = 0%):
  <SortableGrader algorithm="exact">
    <SortableInput>
      <TextBlock initialPosition="3">Check responsiveness</TextBlock>
      <TextBlock initialPosition="1">Call 911</TextBlock>
      <TextBlock initialPosition="2">Begin chest compressions</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### partial (Position-Based)

Awards points for each item in the correct position. Score = (items in correct position) / (total items).

**Use when:** You have longer sequences where getting most items right deserves credit. A student who places 7 of 8 historical events correctly demonstrates more understanding than one who gets 3 correct.

```olx:playground
<CapaProblem id="partial_demo" title="Timeline (partial)">
  Order these events (earn points for each correct position):
  <SortableGrader algorithm="partial">
    <SortableInput>
      <TextBlock initialPosition="2">World War I (1914)</TextBlock>
      <TextBlock initialPosition="4">World War II (1939)</TextBlock>
      <TextBlock initialPosition="1">Moon Landing (1969)</TextBlock>
      <TextBlock initialPosition="3">Berlin Wall Falls (1989)</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### adjacent (Pair-Based)

Awards points for each correctly ordered pair of adjacent items. Checks: Is item 1 before item 2? Is item 2 before item 3? And so on.

**Use when:** The relative ordering between neighbors matters more than absolute position. Good for rankings where "A before B" is the key relationship.

```olx:playground
<CapaProblem id="adjacent_demo" title="Biological Hierarchy (adjacent)">
  Order from smallest to largest (earn points for each correct pair):
  <SortableGrader algorithm="adjacent">
    <SortableInput>
      <TextBlock initialPosition="2">Cell</TextBlock>
      <TextBlock initialPosition="4">Tissue</TextBlock>
      <TextBlock initialPosition="1">Organ</TextBlock>
      <TextBlock initialPosition="3">Organism</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

### spearman (Correlation-Based)

Uses Spearman's rank correlation—a statistical measure of how well the student's ordering matches the correct ordering. Ranges from -1 (reversed) to +1 (perfect), normalized to 0-100%.

**Intuition:** Imagine plotting student rank vs. correct rank for each item. A perfect answer is a diagonal line. Spearman measures how close to that diagonal the student got, penalizing items that are far from their correct position more than items that are slightly off.

**Use when:** You want to reward answers that are "close" to correct even if no single item is in the exact right spot. A student who puts events roughly in the right era deserves more credit than one whose ordering is random.

```olx:playground
<CapaProblem id="spearman_demo" title="Historical Eras (spearman)">
  Order these periods (partial credit based on overall closeness):
  <SortableGrader algorithm="spearman">
    <SortableInput>
      <TextBlock initialPosition="3">Ancient (3000 BCE)</TextBlock>
      <TextBlock initialPosition="1">Medieval (500 CE)</TextBlock>
      <TextBlock initialPosition="4">Renaissance (1400 CE)</TextBlock>
      <TextBlock initialPosition="2">Modern (1800 CE)</TextBlock>
      <TextBlock initialPosition="5">Contemporary (1950 CE)</TextBlock>
    </SortableInput>
  </SortableGrader>
</CapaProblem>
```

## Related Blocks
- **SortableInput**: Input component being graded
- **SimpleSortable**: Simplified sortable problem syntax
- **StatusText**: Displays grading feedback

