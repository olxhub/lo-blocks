# ObservablePlot

Renders data visualizations using [Observable Plot](https://observablehq.com/plot/), a concise, expressive library for exploratory charts.

Specs are written in YAML (default) or JavaScript (`format="js"`). JSON works too, since JSON is valid YAML.

```olx:playground
<ObservablePlot>
marks:
  - type: barY
    data:
      - {category: "Retrieval Practice", score: 85}
      - {category: "Rereading", score: 55}
      - {category: "Highlighting", score: 45}
    x: category
    y: score
    fill: category
y:
  label: "Retention Score (%)"
</ObservablePlot>
```

## Properties

- `format` (optional): `yaml` (default) or `js`
- `src` (optional): Path to an external spec file
- `width` (optional): Plot width in pixels
- `height` (optional): Plot height in pixels

## YAML Format

The YAML spec maps directly to `Plot.plot()` options. Each mark has a `type` field that maps to a Plot mark function (`barY`, `dot`, `line`, `ruleY`, etc.), plus `data` and encoding channels:

```olx:playground
<ObservablePlot>
marks:
  - type: dot
    data:
      - {x: 1, y: 2}
      - {x: 2, y: 5}
      - {x: 3, y: 3}
      - {x: 4, y: 7}
      - {x: 5, y: 4}
    x: x
    y: y
    stroke: steelblue
    r: 5
  - type: ruleY
    data: [0]
</ObservablePlot>
```

## JavaScript Format

For full access to the Plot API, use `format="js"`. The code is a function body with `Plot` available. Return a DOM node:

```olx:code
<ObservablePlot format="js"><![CDATA[
const data = [
  {name: "Testing Effect", value: 0.85},
  {name: "Spacing Effect", value: 0.72},
  {name: "Interleaving", value: 0.68},
];
return Plot.plot({
  marks: [
    Plot.barX(data, {x: "value", y: "name", fill: "steelblue"}),
    Plot.ruleX([0])
  ]
});
]]></ObservablePlot>
```

## External Files

```olx:code
<ObservablePlot src="plots/study_habits.yaml" />
```

## Supported Mark Types

See the [Observable Plot documentation](https://observablehq.com/plot/marks) for the full list, including: `barX`, `barY`, `dot`, `line`, `areaY`, `ruleX`, `ruleY`, `text`, `cell`, `rect`, `tickX`, `tickY`, and many more.
