# MatchingInput

Connect items from a left column to their matches in a right column. Students click an item on the left, then click its corresponding item on the right to create a match.

```olx:playground
<CapaProblem id="matching_demo" title="Match the Concepts">
  <MatchingGrader>
    <Markdown>Match each biological term to its correct definition:</Markdown>
    <MatchingInput id="biology_matching">
      <Markdown id="term_bacteria">Bacteria</Markdown>
      <Markdown id="def_bacteria">Simple, prokaryotic cells that come in various shapes</Markdown>

      <Markdown id="term_archaea">Archaea</Markdown>
      <Markdown id="def_archaea">Group of microorganisms distinct from bacteria and eukaryotes; lack a true nucleus and membrane-bound organelles</Markdown>

      <Markdown id="term_cancer">Cancer</Markdown>
      <Markdown id="def_cancer">Abnormal cells characterized by uncontrolled growth and division</Markdown>

      <Markdown id="term_cartilage">Cartilage</Markdown>
      <Markdown id="def_cartilage">Connective tissue characterized by its solid matrix and lack of blood supply</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

## Properties

- `id` (optional): Unique identifier for the input
- `shuffle` (optional, default: true): Whether to shuffle the right-side items that don't have `initialPosition`

## Item Positioning

By default, right-side items are shuffled to prevent left-to-right positional bias. You can control the display order using the `initialPosition` attribute on right-side items (1-indexed):

```olx:playground
<CapaProblem id="positioned_matching" title="Ordered Matching">
  <MatchingGrader>
    <Markdown>Match in the order shown on the right:</Markdown>
    <MatchingInput id="ordered">
      <Markdown>Third item</Markdown>
      <Markdown initialPosition="3">C - Goes in position 3</Markdown>

      <Markdown>First item</Markdown>
      <Markdown initialPosition="1">A - Goes in position 1</Markdown>

      <Markdown>Second item</Markdown>
      <Markdown initialPosition="2">B - Goes in position 2</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

- Items with `initialPosition` appear in their specified order
- Items without `initialPosition` fill remaining slots (shuffled if `shuffle="true"`)
- Use `shuffle="false"` to disable shuffling of unpositioned items

## State Fields

- `arrangement`: Current matching as object: `{ leftItemId: rightItemId, ... }`

## getValue

Returns an object with:
- `arrangement`: Object mapping left item IDs to their matched right item IDs

## How It Works

- **Structure**: Alternating left/right items. Odd indices (0, 2, 4, ...) are left column; even indices (1, 3, 5, ...) are right column.
- **Interaction**: Click a left item (highlights in blue), then click a right item to connect them. Click a left item again to deselect.
- **Disconnecting**: Click the ✕ button next to a matched left item to break the connection.
- **Visual Feedback**:
  - Blue lines = student's current matches
  - Green lines = correct answers (when showing answer)
  - Connection point circles on each item

## Pedagogical Purpose

Matching exercises are excellent for vocabulary, definitions, concepts, and associations. They encourage active learning through exploration. Unlike multiple-choice, students must consider all options. Unlike sorting, there's no relational ordering—just pairwise associations.

For **immediate mode** (real-time feedback), matching becomes even more engaging: students explore and get instant feedback, turning a passive definition review into active discovery.

## Common Use Cases

### Vocabulary and Definitions

```olx:playground
<CapaProblem id="vocab_matching" title="Biology Vocabulary">
  <MatchingGrader>
    <Markdown>Match each term to its definition:</Markdown>
    <MatchingInput id="vocab">
      <Markdown>Photosynthesis</Markdown>
      <Markdown>Process by which plants convert light energy into chemical energy</Markdown>

      <Markdown>Respiration</Markdown>
      <Markdown>Process by which cells release energy from glucose</Markdown>

      <Markdown>Osmosis</Markdown>
      <Markdown>Movement of water across a semipermeable membrane</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

### Historical Events and Dates

```olx:playground
<CapaProblem id="history_matching" title="World History">
  <MatchingGrader>
    <Markdown>Match historical events with their dates:</Markdown>
    <MatchingInput id="history">
      <Markdown>1066</Markdown>
      <Markdown>Battle of Hastings</Markdown>

      <Markdown>1492</Markdown>
      <Markdown>Columbus reaches the Americas</Markdown>

      <Markdown>1789</Markdown>
      <Markdown>French Revolution begins</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

### Equations and Solutions

```olx:playground
<CapaProblem id="math_matching" title="Match Equations to Solutions">
  <MatchingGrader>
    <Markdown>Match each equation to its solution:</Markdown>
    <MatchingInput id="equations">
      <Markdown>2x + 3 = 11</Markdown>
      <Markdown>x = 4</Markdown>

      <Markdown>x² - 4 = 0</Markdown>
      <Markdown>x = ±2</Markdown>

      <Markdown>3x - 5 = 7</Markdown>
      <Markdown>x = 4</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

### Language Translations

```olx:playground
<CapaProblem id="language_matching" title="Spanish-English Matching">
  <MatchingGrader>
    <Markdown>Match Spanish words to their English equivalents:</Markdown>
    <MatchingInput id="spanish">
      <Markdown>Casa</Markdown>
      <Markdown>House</Markdown>

      <Markdown>Libro</Markdown>
      <Markdown>Book</Markdown>

      <Markdown>Gato</Markdown>
      <Markdown>Cat</Markdown>
    </MatchingInput>
  </MatchingGrader>
</CapaProblem>
```

## Grading

**MatchingGrader** provides partial credit:
- Score = (correct matches) / (total item pairs)
- A student matching 3 out of 4 items correctly receives 75%
- Returns `CORRECT`, `PARTIALLY_CORRECT`, or `UNSUBMITTED`

## Related Blocks

- **MatchingGrader**: Grades matching arrangements with partial credit support
- **SortableInput**: For ordering/sequencing instead of matching
- **ChoiceInput**: For single-select from options

## Notes

- Items can be any block type: Markdown, TextBlock, Image, code blocks, etc.
- By default, the right-side items are shuffled to prevent left-to-right positional bias
- Use `shuffle="false"` to disable shuffling (e.g., if positions carry meaning)
- Unmatched items are allowed—grading is based on what the student did connect, not what they didn't
- Best for 4-10 item pairs; beyond that, cognitive load increases significantly
