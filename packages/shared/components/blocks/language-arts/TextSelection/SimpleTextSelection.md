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
- **selfcheck** → `grade="submit"` + `showAnswer="always"`: select, then reveal the answer to compare.

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

### Selectable unit: words, or chunks

By default the learner clicks single **words**. `separatorRegexp` divides the
passage into **chunks** instead — sentences, clauses, whatever the pattern names
— and the chunk becomes what the learner clicks. Both attributes are forwarded
to the generated [`TextSelectionInput`](./TextSelectionInput.md#the-selectable-unit-words-or-chunks),
which owns the semantics; the stored value is the same array of word indices
either way, so grading and analytics are unaffected.

`separatorRegexp` is a **JavaScript regexp source string**, not a literal: escape
what you must.

Sentences — the period stays visible at the end of each chunk:

```olx:code
<SimpleTextSelection id="antecedent" mode="graded" separatorRegexp="\.">
Click the sentence that describes the intrusion.
---
Temperance societies grew quickly in the 1830s. Members signed pledges and held
public meetings. [Reformers from the middle class pressed their habits on
lower-class workers.] Such intrusions sharpened class tensions.
</SimpleTextSelection>
```

Hand-placed markers — `separatorHidden="true"` consumes the marker and normalises
the whitespace around it, so `Such | intrusions | by the middle class` reads as
"Such intrusions by the middle class" in three chunks:

```olx:code
<SimpleTextSelection id="phrases" mode="immediate" separatorRegexp="\|" separatorHidden="true">
Click the phrase that names who is intruding.
---
Such | intrusions | [by the middle class]
</SimpleTextSelection>
```

Chunk boundaries come from the separator; **correctness still comes from the
brackets**. A marked span that crosses a chunk boundary is an authoring error —
the learner could never select it whole — and so are a regexp the `RegExp`
constructor rejects and one that can match the empty string.

**The "Dr. Jones" caveat.** `separatorRegexp="\."` is a naive sentence split: it
breaks "Dr. Jones spoke." into "Dr." and "Jones spoke." When that bites, place
your own markers and hide them (`separatorRegexp="\|" separatorHidden="true"`),
or use a smarter pattern such as `separatorRegexp="(?<=[.!?])\s+"` with
`separatorHidden="true"`, which splits on the whitespace after terminal
punctuation. Neither knows an abbreviation from a sentence end; real sentence
segmentation with NLP is a possible later addition, not this attribute.

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
| `separatorRegexp` | No | – | JavaScript regexp source dividing the passage into selectable chunks. Absent: the learner selects single words. |
| `separatorHidden` | No | `false` | `true`: the match is consumed and never rendered. `false`: it stays at the end of the left chunk and renders as content. |

The problem attributes (`title`, `maxAttempts`, `showAnswer` — the deprecated
`showanswer` spelling still parses — `answerReveal`, `lockInput`, `grade`) may
be authored here and pass through to the generated CapaProblem; `mode` wins
over any `grade`/`showAnswer` it sets. Passage content is provided
inline **or** via `src` (not both).

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
