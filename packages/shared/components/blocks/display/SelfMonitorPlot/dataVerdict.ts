// A grading verdict about typed data, decided by the code that plots it.
//
// Two items need this. Handout 3's 1b scores a point per week of data present;
// 1c gates on whether the student produced a graph of their own at all. Both are
// facts about the same four fields, so both are answered here rather than by a
// model looking at a picture.
//
// It lives beside `parseSeries` deliberately. The whole value of deriving these
// verdicts is that the grader cannot disagree with what the student sees, and a
// second "is this a number" in some other folder would eventually drift from the
// first with nothing to catch it.

import { parseSeries } from './_SelfMonitorPlot';
import { MET, ABSENT, MISMATCH } from '@/lib/llm/slotSheet';

export type DataVerdict = { verdict: string; evidence: string };

/**
 * Is there plottable data here, and is it the student's own?
 *
 *   `absent`    no field holds a number, so nothing plots
 *   `mismatch`  every series matches `template` — the worked example's own data
 *   `met`       otherwise
 *
 * `met` needs only ONE number, not a full week. Handout 3's rubric is explicit
 * that this is a presence check: "Any legible daily figures for a week earn its
 * point... Do not deduct for formatting, units, or gaps within a week." A short
 * or partly unreadable week still earns it, which makes this deliberately more
 * lenient than the warnings SelfMonitorPlot shows under the chart — those are
 * advice about data quality, and this is the score.
 */
export function dataVerdict(texts: string[], template: number[][] = []): DataVerdict {
  const labels = texts.map((_, i) => `Series ${i + 1}`);
  const { rows } = parseSeries(texts, labels, []);
  if (!rows.length) {
    return {
      verdict: ABSENT,
      evidence: texts.length === 1
        ? 'No numbers here, so nothing plots for this week.'
        : 'None of the data fields hold numbers, so no graph is drawn.',
    };
  }
  // Every series matching means they plotted the example's data, not their own.
  // All of them, not some: a student who copied one week and tracked the rest
  // has still tracked their own behaviour.
  const mine = labels.map(l => rows.filter(r => r.series === l).map(r => r.value));
  const copied = template.length > 0
    && template.length === mine.length
    && template.every((t, i) =>
      t.length === mine[i].length && t.every((v, j) => v === mine[i][j]));
  if (copied) {
    return {
      verdict: MISMATCH,
      evidence: "This is the worked example's own data, not a record of your behaviour.",
    };
  }
  const filled = texts.filter(t => t.trim()).length;
  return {
    verdict: MET,
    evidence: texts.length === 1
      ? `${rows.length} value(s) entered.`
      : `${rows.length} value(s) plotted from ${filled} of ${texts.length} data field(s).`,
  };
}

/**
 * Is the WHOLE month there — every week the graph needs?
 *
 * The web's equivalent of the paper item's "did not provide a graph". On paper that
 * cost the whole item, and the failure was a student who had their data and never
 * drew the chart. The web draws it for them, so that exact failure is gone — but
 * the analogous one is not: a chart missing weeks is not the graph the item asks
 * for, and the runtime can see it directly.
 *
 * Stricter than `dataVerdict`, deliberately. That one asks "does anything plot",
 * which is right for 1b, where the rubric scores a point per week present and says
 * not to deduct for gaps within a week. This asks "is every week present", which is
 * right for a whole-item gate on the graph.
 */
export function completeVerdict(texts: string[], template: number[][] = []): DataVerdict {
  const missing = texts.filter(t => !parseSeries([t], ['s'], []).rows.length).length;
  if (missing === texts.length) {
    return {
      verdict: ABSENT,
      evidence: 'None of the data fields hold numbers, so no graph is drawn.',
    };
  }
  if (missing > 0) {
    return {
      verdict: ABSENT,
      evidence: `${missing} of the ${texts.length} weeks hold no data, so the graph `
        + 'covers only part of the month. Enter all four weeks — the baseline week '
        + 'and weeks 1, 2 and 3 — and the chart will show the whole period.',
    };
  }
  // Complete, so the only remaining question is whose data it is.
  return dataVerdict(texts, template);
}
