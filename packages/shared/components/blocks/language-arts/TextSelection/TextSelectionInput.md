# TextSelectionInput

Interactive passage where the learner selects words or phrases marked in the
source markup. The **input** half of the TextSelection family; pair it with a
[`TextSelectionGrader`](./TextSelectionGrader.md), or use the terse
[`<SimpleTextSelection>`](./SimpleTextSelection.md) tag that composes both.

The value is the selection itself — an array of selected word indices.

```olx:playground
<CapaProblem id="nouns" title="Find the nouns" grade="submit">
  <TextSelectionGrader>
    <TextSelectionInput>
Highlight all the nouns:
---
{The} [cat] sat on {the} [mat] near {the} [window].
    </TextSelectionInput>
  </TextSelectionGrader>
</CapaProblem>
```

## How It Works

- Renders the passage word by word. Clicking a word toggles it; dragging
  toggles the whole span.
- Stores the selection under the `selections` field (its value) — an array of
  the selected word indices.
- Shows per-term targeted feedback for selected labeled segments.
- On Show Answer (driven by the grader), overlays the answer key in the passage.

Used **alone** (no grader), the input simply collects a free selection — useful
for annotation or close-reading activities where nothing is scored.

## Passage grammar

The passage is authored in the `.textSelectionpeg` markup. A passage has up to
four sections, separated by lines containing only `---`:

```
Prompt text (shown above the passage)
---
The passage itself, with segments marked.
---
Scoring rules (optional)
---
Targeted feedback by label (optional)
```

### Segments

Everything in the passage body is a *segment*. Four kinds:

| Syntax | Type | Meaning |
|--------|------|---------|
| `[phrase]` | Required | The learner must select every word for credit |
| `{phrase}` | Optional | Selecting it neither helps nor hurts |
| `<<phrase>>` | Feedback trigger | A decoy — selecting any of its words subtracts |
| anything else | Plain text | Neutral; selecting a plain word subtracts |

A segment may be a single word or a multi-word phrase; a required phrase counts
as *found* only when **all** its words are selected.

### Labels

Append `|label` inside a segment to give it an id used by targeted feedback and
answer-key display:

```
[solar panels|solar] and <<coal plants|coal>>
```

### Escaping

A literal bracket is escaped with a backslash: `\[not a segment\]` renders as
plain text `[not a segment]`.

The **scoring rules** (third section) and **targeted feedback** (fourth section)
are consumed by the grader; see
[`TextSelectionGrader`](./TextSelectionGrader.md#scoring-rules). The input carries
them through untouched.

## Answer key for graders

Exposes `getExpectedSelections` as a local: a pure projection of the parsed
passage (segment types, the word indices each spans, and the scoring rules) that
`TextSelectionGrader` consumes without re-tokenizing. One tokenization, owned by
the input, so a stored index means the same thing in the UI and in grading.

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | – | Unique identifier |
| `src` | No | – | Path to an external `.textSelectionpeg` passage file |

Passage content is provided inline **or** via `src` (not both).

## State Fields

- `selections`: the current selection as an array of word indices (the value).

## Related Blocks

- **TextSelectionGrader**: scores this input's selection.
- **SimpleTextSelection**: the terse tag that composes the pair.
