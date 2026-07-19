# TextSelection

Interactive text-highlighting exercise where learners select words or phrases
marked in a passage.

`<TextSelection>` is the terse one-tag spelling. It parses the passage and
expands to a [`TextSelectionGrader`](./TextSelectionGrader.md) wrapping a
[`TextSelectionInput`](./TextSelectionInput.md) inside a problem, reusing the
standard problem chrome (header, Check/Show-Answer footer, grading). Author the
pair by hand when you need finer control (see the two block docs).

## Overview

TextSelection presents a passage where learners click or drag to highlight
words. Three interaction modes map onto standard problem semantics:

- **immediate** (default) → `grade="immediate"`: correctness derives live, no button.
- **graded** → `grade="submit"`: the standard Check button, submit-time grading.
- **selfcheck** → `grade="submit"` + `showanswer="always"`: select, then reveal the answer to compare.

## Basic Usage

Inline content:

```olx:code
<TextSelection id="concepts" mode="immediate">
Highlight all the nouns:
---
The [cat] sat on the [mat] near the [window].
</TextSelection>
```

Or load the passage from an external `.textSelectionpeg` file:

```olx:code
<TextSelection id="concepts" mode="graded" src="cooperative_learning.textSelectionpeg" />
```

## Content Format

The passage uses a small markup syntax (the `.textSelectionpeg` grammar):

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
`incorrect`. A bare `:` is the fallback rule.

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

Subtractive partial credit:

```
score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1)
```

- `requiredFound` — required segments with **every** word selected.
- `wrongSelected` — each selected plain word (counts once each) plus each
  `<<trigger>>` segment touched (counts once). Optional segments never count.
- **Correct** when all required are found and nothing wrong is selected;
  **partially correct** for any score in between; **incorrect** at zero.

Because wrong picks subtract, selecting the whole passage no longer earns full
credit (the previous prototype's bug).

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | – | Unique identifier |
| `mode` | No | `immediate` | One of `immediate`, `graded`, `selfcheck` |
| `src` | No | – | Path to an external `.textSelectionpeg` passage file |

Passage content is provided inline **or** via `src` (not both).

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
