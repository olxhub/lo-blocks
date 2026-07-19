# TextSelectionInput

Interactive passage where the learner selects words or phrases marked in the
source markup. The **input** half of the TextSelection family; pair it with a
[`TextSelectionGrader`](./TextSelectionGrader.md), or use the terse
[`<TextSelection>`](./TextSelection.md) tag that composes both.

The value is the selection itself — an array of selected word indices.

```olx:playground
<CapaProblem id="nouns" title="Find the nouns" grade="submit">
  <TextSelectionGrader>
    <TextSelectionInput>
Highlight all the nouns:
---
The [cat] sat on the [mat] near the [window].
    </TextSelectionInput>
  </TextSelectionGrader>
</CapaProblem>
```

## How It Works

- Renders the passage word by word. Clicking a word toggles it; dragging
  toggles the whole span.
- Stores the selection under the `selections` field (its value).
- Shows per-term targeted feedback for selected labeled segments.
- On Show Answer (driven by the grader), overlays the answer key in the passage.

## Content Format

Same markup as [`TextSelection`](./TextSelection.md): a prompt, `---`, the
passage with `[required]`, `{optional}`, and `<<trigger>>` segments, and
optional scoring / targeted-feedback sections. Provide it inline or via `src`.

## Answer key for graders

Exposes `getExpectedSelections` as a local: a pure projection of the parsed
passage (segment types, the word indices each spans, and the scoring rules) that
`TextSelectionGrader` consumes without re-tokenizing.

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | – | Unique identifier |
| `src` | No | – | Path to an external `.textSelectionpeg` passage file |

## Related Blocks

- **TextSelectionGrader**: scores this input's selection.
- **TextSelection**: the terse tag that composes the pair.
