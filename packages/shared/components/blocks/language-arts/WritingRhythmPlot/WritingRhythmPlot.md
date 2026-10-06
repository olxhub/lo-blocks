# WritingRhythmPlot

A reactive bar chart that visualizes writing rhythm in any text source.
Each bar is a sentence. Each stacked segment is a word — by default, taller
segments are longer words. Paragraph breaks appear as gaps between groups of
bars. The chart updates live as the target text changes.

Reads its data from any block with a value (TextArea, LLMFeedback, Markdown,
etc.) via the `target` attribute.

## Usage

```xml
<TextArea id="essay" rows="8" />
<WritingRhythmPlot target="essay" />
```

## Attributes

Attributes are generated from the schema and shown on this block's Overview tab —
name, type, whether it is required, the description, and the permitted values.
A hand-kept copy here is a second source of one table, and the copy is what rots.

## How to read the chart

- **Bar height** — sentence length (in characters or words, depending on mode)
- **Segments within a bar** — individual words, colored with a slow hue rotation
- **Gaps** — paragraph breaks
- **Hover** — shows the word for each segment

## Examples

- `WritingRhythmPlot.olx` — simple editable text with live chart
- `WritingRhythmPlotComparative.olx` — tabbed comparison of the same passage
  in journalistic, simplified, and academic styles (Ripley, *The Smartest Kids
  in the World*), using shared `xrange`/`yrange` for common axes
