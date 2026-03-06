# SentenceVarietyPlot

A reactive bar chart that visualizes sentence structure in any text source.
Each bar is a sentence. Each stacked segment is a word — by default, taller
segments are longer words. Paragraph breaks appear as gaps between groups of
bars. The chart updates live as the target text changes.

Reads its data from any block with a value (TextArea, LLMFeedback, Markdown,
etc.) via the `target` attribute.

## Usage

```xml
<TextArea id="essay" rows="8" />
<SentenceVarietyPlot target="essay" />
```

## Attributes

| Attribute | Type   | Description |
|-----------|--------|-------------|
| target    | string | **Required.** ID of the block whose value to analyze |
| mode      | string | `characters` (default): segment height = letter count. `words`: uniform height, so bar height = word count |
| xrange    | number | Fix x-axis to this many sentence slots (for common axes across multiple plots) |
| yrange    | number | Fix y-axis maximum (for common axes across multiple plots) |
| width     | number | Chart width in pixels (auto if omitted) |
| height    | number | Chart height in pixels (default 200) |

## How to read the chart

- **Bar height** — sentence length (in characters or words, depending on mode)
- **Segments within a bar** — individual words, colored with a slow hue rotation
- **Gaps** — paragraph breaks
- **Hover** — shows the word for each segment

## Examples

- `SentenceVarietyPlot.olx` — simple editable text with live chart
- `SentenceVarietyPlotComparative.olx` — tabbed comparison of the same passage
  in journalistic, simplified, and academic styles (Ripley, *The Smartest Kids
  in the World*), using shared `xrange`/`yrange` for common axes
