# MatchingGrader

Grades matching exercises where students connect items from a left column to a right column.

```olx:playground
<CapaProblem id="graded_match" title="Science Terms">
  <MatchingGrader id="science_grader">
    <Markdown>Match each term to its definition:</Markdown>
    <MatchingInput id="science_match">
      <Markdown>Photosynthesis</Markdown>
      <Markdown>Process by which plants convert light energy into chemical energy stored in glucose</Markdown>

      <Markdown>Mitochondria</Markdown>
      <Markdown>Cellular structure responsible for producing ATP through cellular respiration</Markdown>

      <Markdown>Osmosis</Markdown>
      <Markdown>Movement of water molecules across a semipermeable membrane from high to low concentration</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

## Properties

- `id` (optional): Unique identifier for the grader
- `target` (optional): ID of MatchingInput to grade (auto-inferred if nested directly)

## State Fields

- `correct`: Correctness status (CORRECT, PARTIALLY_CORRECT, UNSUBMITTED)
- `message`: Feedback message showing score (e.g., "3/4 correct")

## Grading Scheme

MatchingGrader uses **partial credit** scoring:

- **Score** = (number of correct matches) / (total item pairs)
- Example: A student matching 3 out of 4 items correctly receives 75% and `PARTIALLY_CORRECT` status
- Perfect matches (all items correct) returns `CORRECT`
- No matches submitted returns `UNSUBMITTED`

### Feedback Format

The grader provides simple, clear feedback:
- `3/4 correct` - Shows student how many they got right
- Works well with immediate mode: real-time feedback as students click

## Why Partial Credit?

Unlike sorting (where one error cascades), matching is fundamentally pairwise. A student who knows 7 out of 10 definitions has demonstrated real learning and should be credited for it. Partial credit encourages exploration: students can discover what they know by testing combinations.

## Common Patterns

### With CapaProblem and Action Button

```olx:playground
<CapaProblem id="matching_with_button" title="Biology Vocab">
  <MatchingGrader id="biology_grader">
    <MatchingInput id="bio_input">
      <Markdown>Enzyme</Markdown>
      <Markdown>Protein that catalyzes biochemical reactions</Markdown>

      <Markdown>Substrate</Markdown>
      <Markdown>Molecule that binds to an enzyme's active site</Markdown>
    </MatchingInput>
  </MatchingGrader>
  <ActionButton target="biology_grader">Check Answer</ActionButton>
</CapaProblem>
```

### Direct Nesting (Implicit Target)

```olx:playground
<CapaProblem id="direct_nesting" title="History Dates">
  <MatchingGrader>
    <MatchingInput>
      <Markdown>1789</Markdown>
      <Markdown>French Revolution</Markdown>

      <Markdown>1865</Markdown>
      <Markdown>End of US Civil War</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

## Related Blocks

- **MatchingInput**: The interactive matching component
- **SortableGrader**: For ordering/sequencing instead of matching
- **CapaProblem**: Common wrapper for grading problems
- **ActionButton**: Triggers grading on demand

## Future: Immediate Mode

In future updates, MatchingGrader will support immediate/real-time feedback via CapaProblem's `immediate="true"` attribute, showing live scoring as students connect items.
