# SelfMonitorPlot

Charts several series of numbers that a student typed into inputs — one input per series.

Use this when the data belongs to the student. `ObservablePlot` takes its spec as literal text and cannot read state, so it is the right block for a worked example with fixed numbers, and the wrong one for "graph what you collected."

```olx:code
<TextArea id="wk0" rows="1" placeholder="8, 10, 8, 12, 6, 10, 0" />
<TextArea id="wk1" rows="1" placeholder="32, 20, 22, 28, 30, 32, 10" />

<SelfMonitorPlot target="wk0,wk1"
                 labels="Baseline,Week 1"
                 categories="Sun,Mon,Tue,Wed,Thu,Fri,Sat"
                 ylabel="Ounces of water per day" />
```

The chart updates as the student types. Nothing needs to be submitted.

## Attributes

| Attribute | Required | Description |
|---|---|---|
| `target` | yes | Input IDs holding the data, comma-separated — one per series |
| `labels` | no | Series names for the legend (defaults to `Series 1`, `Series 2`, …) |
| `categories` | no | X-axis category names (defaults to `1`, `2`, `3`, … per data point) |
| `type` | no | `bar` (default) or `line` |
| `chartTitle` / `xlabel` / `ylabel` | no | Static label text. Note `chartTitle`, not `title` — every block has a structural `title` used by tabs and navigation |
| `chartTitleTarget` / `xlabelTarget` / `ylabelTarget` | no | Read a label from an input instead, reactively |
| `labelsTarget` | no | Read the series names from an input — this is how a student writes their own legend |
| `width` / `height` | no | Pixels; height defaults to 320 |

## Input format

Each targeted input holds a list of numbers. Commas, spaces, semicolons and newlines all separate, so `8, 10, 8` and `8 10 8` and one-per-line are equivalent. Position determines category: the *n*th number in every series lands on the *n*th category.

Series may be different lengths — a student part-way through week 3 gets a chart of what they have so far.

## Labels the student controls

Pointing `chartTitleTarget` / `xlabelTarget` / `ylabelTarget` at inputs makes labelling consequential: the student types an axis label and watches it land on their own chart, rather than reporting it and being told later whether it was right.

```olx:code
<TextArea id="my_ylabel" rows="1" placeholder="Minutes of exercise per day" />

<SelfMonitorPlot target="wk0,wk1,wk2,wk3"
                 labels="Baseline,Week 1,Week 2,Week 3"
                 ylabelTarget="my_ylabel" />
```

A `*Target` attribute wins over its static counterpart while it holds text, and falls back to the static one when empty.

### Letting the student write the legend

`labelsTarget` is the exception to that fallback, deliberately. Naming the series *is* writing the legend, so once it is wired the static `labels` no longer applies: a student who has not named their series sees `Series 1, Series 2, …` on their own chart, which is exactly what an unlabelled key looks like. Falling back to author-supplied names would hand them a correct legend they did not write, and make "does this graph have a legend?" unanswerable.

There is no legend *title* attribute: Observable Plot renders no label for a categorical swatches legend, so an input for one would collect text the chart never shows.

```olx:code
<TextArea id="my_series" rows="1" placeholder="Baseline, Week 1, Week 2, Week 3" />

<SelfMonitorPlot target="wk0,wk1,wk2,wk3" labelsTarget="my_series" />
```

## What the chart reports back

Three kinds of problem are listed under the chart rather than left for the reader to notice. Series are named by their `labels`, or as `Series N` where none is authored.

**Entries that are not numbers** are named and excluded:

> Could not read these entries as numbers, so they are not on the chart: "n/a" (Series 2), "twelve" (Series 3)

**A series with nothing in it**, once any other series has data:

> Nothing entered yet for Series 2, Series 3 — those series are missing from the chart entirely.

**A series whose length does not match the categories:**

> Series 1 has 3 values but the chart expects 7 — the last 4 are missing.

All three exist for the same reason. A chart drawn from partial input still looks finished: a blank series is simply absent from the legend, and a short one is a shorter run of marks. Nothing about the picture says data is missing, so the gap survives until someone downstream notices it — by which time whoever typed the data has moved on. Naming it while the data is still being entered is most of the value of deriving a chart from inputs instead of accepting a finished image.

Two deliberate limits. Completeness is reported only when the block has authored `categories` to compare against, since otherwise the expected length is undefined. And nothing is reported while every series is empty, because that is the normal state of an untouched form and warning there would be noise.

## Note on starter text

Series inputs should use `placeholder=`, not child text. The multi-target read goes through `useAggregate`, which reads the raw Redux field and does not apply a block's authored-text fallback — so child text would not plot, while a `placeholder` correctly shows an example without becoming data.

## Related

- `ObservablePlot` — full Plot API for author-supplied data
- `WritingRhythmPlot` — same target-and-derive shape, for prose rather than numbers
