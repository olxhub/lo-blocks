# SimpleTextSelection

Interactive text-highlighting exercise where learners select words or phrases
marked in a passage.

`<SimpleTextSelection>` is the terse one-tag spelling (the SimpleSortable /
SimpleMatching pattern). It parses the passage and expands to a CapaProblem
wrapping a [`TextSelectionGrader`](./TextSelectionGrader.md) →
[`TextSelectionInput`](./TextSelectionInput.md) pair, so it gets the standard
problem chrome (header, Check / Show-Answer footer, grading) for free. Author the
pair by hand when you need finer control (see the two block docs).

## Overview

SimpleTextSelection presents a passage where learners click or drag to highlight
words. Three interaction modes map onto standard problem semantics:

- **immediate** (default) → `grade="immediate"`: correctness derives live, no button.
- **graded** → `grade="submit"`: the standard Check button, submit-time grading.
- **selfcheck** → `grade="submit"` + `showanswer="always"`: select, then reveal the answer to compare.

## Basic Usage

Inline content:

```olx:code
<SimpleTextSelection id="concepts" mode="immediate">
Highlight all the nouns:
---
{The} [cat] sat on {the} [mat] near {the} [window].
</SimpleTextSelection>
```

Or load the passage from an external `.textSelectionpeg` file:

```olx:code
<SimpleTextSelection id="concepts" mode="graded" src="cooperative_learning.textSelectionpeg" />
```

## Content Format

The passage uses a small markup syntax (the `.textSelectionpeg` grammar). The
grammar reference lives with the block that owns it,
[`TextSelectionInput`](./TextSelectionInput.md#passage-grammar); the essentials:

```
Prompt text goes here
---
Regular text with [required words] and {optional words} marked.
```

### Segment Types

| Syntax | Type | Effect on score |
|--------|------|-----------------|
| `[word]` | Required | Must be selected for credit |
| `{word}` | Optional | Never helps nor hurts |
| `<<word>>` | Feedback trigger | Decoy — selecting it subtracts |
| plain text | Neutral | Selecting it subtracts |

### Labels

Add `|label` to a segment to attach targeted feedback:

```
[shared goals|goals] and <<individual competition|competition>>
```

### Scoring Rules

An optional third section maps conditions to feedback messages:

```
Find the key researchers:
---
[Aronson] developed Jigsaw. [Slavin] studied achievement. [Johnson] defined elements.
---
all: Excellent! You identified all three researchers.
>1: Good start! There are more to find.
: Review the history of cooperative learning research.
```

Conditions: `all` (all required, no errors), `>N` / `<N` / `=N` on `found`,
and compound forms like `>1,errors<1`. Fields are `found`, `errors`,
`incorrect`. A bare `:` is the fallback rule. Full semantics live in the
[`TextSelectionGrader`](./TextSelectionGrader.md#scoring-rules) doc.

### Targeted Feedback

A fourth section keys per-term notes by label:

```
...[solar panels|solar] and <<coal plants|coal>>...
---
---
solar: Correct! Solar energy is renewable.
coal: Not quite — coal is a fossil fuel.
```

## Scoring model

Subtractive partial credit (see [`TextSelectionGrader`](./TextSelectionGrader.md)
for the full derivation):

```
score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1)
```

Because wrong picks subtract, selecting the whole passage no longer earns full
credit.

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | – | Unique identifier |
| `mode` | No | `immediate` | One of `immediate`, `graded`, `selfcheck` |
| `src` | No | – | Path to an external `.textSelectionpeg` passage file |

Any other problem attribute (`title`, `maxAttempts`, `showanswer`, …) passes
through to the generated CapaProblem. Passage content is provided inline **or**
via `src` (not both).

## Generated Structure

SimpleTextSelection expands into:

- `{id}_problem` — CapaProblem container (owns the footer and Show Answer)
- `{id}_grader` — TextSelectionGrader for scoring
- `{id}_input` — TextSelectionInput with the passage and selection UI

## Visual Feedback

On Show Answer (or in selfcheck after reveal), the passage overlays the key:

- **Green** — required word
- **Yellow** — optional word
- **Red** — feedback-trigger (decoy) word

The learner's own picks are outlined so they can compare.

## Pedagogical Applications

Text highlighting appears frequently in standardized assessments (identifying
evidence, classifying concepts) and supports active-reading strategies. The
interaction generates rich analytics: heatmaps of which phrases learners
highlighted reveal both shared understanding and points of confusion.

## Related Blocks

- **TextSelectionInput** / **TextSelectionGrader**: the input + grader this tag composes.
- **CapaProblem**: wrapper for hand-composed graded exercises.
- **Markdown**: prompt text and instructions.
