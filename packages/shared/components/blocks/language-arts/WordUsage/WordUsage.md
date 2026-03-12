# WordUsage

Visualizes writing patterns by highlighting text from a target block (TextArea,
Freewrite, etc.). Supports four analysis modes, each illuminating different
aspects of writing. Updates live as the target text changes.

TODO: Rename to WritingAnalysis once the existing TextHighlight block
(input/TextHighlight — student text selection) is renamed to TextSelector.

## Usage

```xml
<TextArea id="essay" rows="8" />
<WordUsage target="essay" mode="repeated_words" />
```

With transition words from inline text:

```xml
<WordUsage target="essay" mode="transition_words">
  however, therefore, furthermore, on the other hand
</WordUsage>
```

Or from a file:

```xml
<WordUsage target="essay" mode="transition_words" src="transitions.txt" />
```

## Modes

| Mode | What it highlights |
|------|-------------------|
| `repeated_words` | Content words used more than once (stop words excluded). Color intensity escalates with frequency — pale for 2 uses, vivid red for many. |
| `sentence_starters` | First word of each sentence. Identical starters share a color — a wall of the same color reveals repetitive openings. |
| `alliteration` | Runs of 2+ consecutive words starting with the same letter (spans across sentence boundaries). Stop words are transparent — they don't break runs. Each initial letter gets its own color. |
| `transition_words` | Words from a provided list (inline text or `src` attribute). All highlighted in the same gentle color. |

## Attributes

| Attribute   | Type    | Default | Description |
|-------------|---------|---------|-------------|
| `target`    | string  | —       | **Required.** ID of the block whose text to analyze. |
| `mode`      | string  | —       | **Required.** Analysis mode (see above). |
| `summary`   | boolean | `true`  | Show summary strip at bottom with highlight counts. |
| `highlight` | boolean | `true`  | Show highlighted text. |
| `words`     | string  | —       | Comma-separated word/phrase list (for `transition_words` mode). Can be provided as inline text content or via `src` attribute. |
| `src`       | string  | —       | Path to external file containing word list. |

## Summary strip

The summary strip at the bottom aggregates the highlights: each unique word or
pattern is shown as a colored chip with a count. Sorted by frequency, top 10
shown. The chip color matches the highlight color in the text.

Set `summary="false"` to hide it, or `highlight="false" summary="true"` to show
only the summary without the highlighted text.

## Examples

- `WordUsage.olx` — minimal demo with repeated words
- `WordUsageDemo.olx` — all four modes side by side
