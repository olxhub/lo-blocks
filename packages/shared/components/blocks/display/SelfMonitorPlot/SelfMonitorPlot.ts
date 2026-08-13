// SelfMonitorPlot - charts several series of student-entered numbers.
//
// The problem this solves: ObservablePlot takes its spec as literal text, and
// `{{...}}` interpolation is implemented only in Markdown. So there is no way
// to assemble a plot spec out of what a student typed into a set of inputs —
// SetFieldAction writes literal strings, CopyFieldAction copies one field
// wholesale, and the format="js" sandbox is `new Function('Plot', code)` with
// no access to state. Composition has to happen inside a block.
//
// So this block does the composing. Point `target` at one input per series;
// each holds a comma- or space-separated list of numbers. The block parses
// them, pairs them off against `categories`, and plots the result.
//
//   <SelfMonitorPlot target="run1,run2,run3"
//                    labels="Run 1,Run 2,Run 3"
//                    categories="T1,T2,T3,T4,T5" />
//
// Axis labels and the title can be wired to inputs too (`titleTarget`,
// `xlabelTarget`, `ylabelTarget`), which turns labelling a chart from a
// self-report question into something the author of the data sees take effect.
//
// What the chart cannot use, it says so: non-numeric entries, series left
// empty, and series whose length does not match `categories` are all reported
// beneath the plot. A chart drawn from partial input otherwise looks finished.
//
// Modelled on WritingRhythmPlot (target -> derive -> Plot.plot), with the
// multi-target read borrowed from AggregatedInputs.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_stateRef, z_stateRefList } from '@/lib/blocks/attributeSchemas';
import _SelfMonitorPlot from './_SelfMonitorPlot';

const SelfMonitorPlot = core({
  ...parsers.ignore(),
  name: 'SelfMonitorPlot',
  requiresUniqueId: false,
  component: _SelfMonitorPlot,
  description: 'Charts several series of numbers typed into student inputs, one input per series.',
  attributes: z.object({
    target: z_stateRefList
      .describe('Input IDs holding the data, comma-separated — one per series'),
    labels: z.string().optional()
      .describe('Series names for the legend, comma-separated (defaults to "Series 1", "Series 2", ...)'),
    categories: z.string().optional()
      .describe('X-axis category names, comma-separated (defaults to 1, 2, 3, ... per data point)'),
    type: z.enum(['bar', 'line']).optional()
      .describe('Chart type: bar (default, grouped and faceted by category) or line'),

    // Static label text
    chartTitle: z.string().optional().describe('Chart title (the base `title` attribute is structural — tabs and navigation — so the chart title needs its own name)'),
    xlabel: z.string().optional().describe('X-axis label'),
    ylabel: z.string().optional().describe('Y-axis label'),

    // ...or read the labels reactively from inputs, so a student's own
    // labelling shows up on their own chart.
    chartTitleTarget: z_stateRef.optional().describe('Read the chart title from this input'),
    xlabelTarget: z_stateRef.optional().describe('Read the x-axis label from this input'),
    ylabelTarget: z_stateRef.optional().describe('Read the y-axis label from this input'),
    // Naming the series is naming the legend: the key IS the series names, so
    // this is how a student authors a legend rather than being handed one.
    // Unlike the label targets there is no fallback to the static `labels` when
    // the input is empty — series fall back to "Series 1..n", which is what an
    // unnamed legend actually looks like and is the honest thing to plot.
    labelsTarget: z_stateRef.optional()
      .describe('Read the comma-separated series names from this input'),
    // There is deliberately no legend TITLE attribute. Observable Plot renders
    // no label for a categorical swatches legend — verified against `color:
    // {legend: true, label}`, `{legend: 'swatches', label}` and a standalone
    // `plot.legend('color', {label})`, none of which emit it. An input whose
    // text never reaches the chart is worse than no input, so the legend is its
    // series names and nothing else.

    width: z.coerce.number().optional().describe('Chart width in pixels'),
    height: z.coerce.number().optional().describe('Chart height in pixels'),
  }).strict(),
});

export default SelfMonitorPlot;
