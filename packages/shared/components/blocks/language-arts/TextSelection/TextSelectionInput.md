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

- Renders the passage word by word. Clicking a word toggles it; dragging applies
  one gesture to the whole span — starting on an unselected word selects
  everything the drag touches, starting on a selected word clears everything it
  touches, so a corrective second drag over an overshoot removes the overshoot
  instead of inverting the correct words underneath.
- Stores the selection under the `selections` field (its value) — an array of
  the selected word indices.
- Shows per-term targeted feedback for selected labeled segments.
- On Show Answer (driven by the grader), overlays the answer key in the passage.

Used **alone** (no grader), the input simply collects a free selection — useful
for annotation or close-reading activities where nothing is scored.

## The selectable unit: words, or chunks

By default the learner selects **words**: the passage is split on whitespace.
`separatorRegexp` generalises that split. Give it a regexp and the passage is
divided into **chunks** at every match; the chunk becomes the thing the learner
clicks — whole sentences, clauses, or any unit you can name with a pattern.

The value is unchanged either way. A chunk writes the word indices it spans, so
the grader, the scoring, the stored events, and the analytics heatmap read chunk
mode without knowing it exists.

`separatorRegexp` is a **JavaScript regexp source string**, not a literal: escape
what you must (`\.` for a period, `\|` for a pipe). It is compiled once, with no
flags beyond the global flag.

Sentences — the period stays visible at the end of each sentence:

```olx:playground
<TextSelectionInput id="antecedent" separatorRegexp="\.">
Click the sentence that describes the intrusion.
---
Temperance societies grew quickly in the 1830s. Members signed pledges and held
public meetings. [Reformers from the middle class pressed their habits on
lower-class workers.] Such intrusions sharpened class tensions.
</TextSelectionInput>
```

Hand-placed markers — `separatorHidden="true"` consumes the marker so it never
reaches the learner, and normalises the whitespace around it so words do not run
together. `Such | intrusions | by the middle class` becomes three chunks reading
"Such intrusions by the middle class":

```olx:playground
<TextSelectionInput id="phrases" separatorRegexp="\|" separatorHidden="true">
Click the phrase that names who is intruding.
---
Such | intrusions | [by the middle class]
</TextSelectionInput>
```

In chunk mode a chunk is a real button: click, Enter, or Space toggles the whole
chunk, hovering outlines it, and a drag flips every chunk it touched. Reveal
styling is unchanged — the same per-segment colours now read as "the right chunk
/ the other chunks."

### Authoring errors

Three things fail loudly rather than quietly misbehaving:

- A `separatorRegexp` the `RegExp` constructor rejects — the message is the
  constructor's own, with the block id.
- A `separatorRegexp` that can match the empty string (e.g. `\.*`), which would
  split between every character.
- A marked span that **crosses a chunk boundary**. The learner could never select
  it whole, so `[a sentence. And another]` under `separatorRegexp="\."` is an
  error naming the span and the two chunks it straddles. Chunk boundaries come
  from the separator; correctness still comes from the brackets, and the two must
  agree.

### The "Dr. Jones" caveat

`separatorRegexp="\."` is a naive sentence split. It breaks on abbreviations,
initials, decimals, and ellipses: "Dr. Jones spoke." becomes two chunks, "Dr."
and "Jones spoke." When that bites, either place your own markers and hide them
(`separatorRegexp="\|" separatorHidden="true"`), which is exact and gives you
clause- or phrase-sized chunks as easily as sentences, or use a smarter pattern
— `separatorRegexp="(?<=[.!?])\s+"` splits on the whitespace *after* terminal
punctuation, which keeps the punctuation attached and is worth pairing with
`separatorHidden="true"` so the run of whitespace is consumed. (Lookbehind works
here; the match is found in the passage text, not inside one word.) It still does
not know "Dr." from a sentence end. Real sentence segmentation — an NLP-backed
`sentences` mode — is a possible later addition, not this attribute.

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
| `separatorRegexp` | No | – | JavaScript regexp source dividing the passage into selectable chunks. Absent: the learner selects single words. |
| `separatorHidden` | No | `false` | `true`: the match is consumed and never rendered. `false`: it stays at the end of the left chunk and renders as content. |

Passage content is provided inline **or** via `src` (not both).
`separatorHidden` has no effect without `separatorRegexp`.

## State Fields

- `selections`: the current selection as an array of word indices (the value).

## Related Blocks

- **TextSelectionGrader**: scores this input's selection.
- **SimpleTextSelection**: the terse tag that composes the pair.
