'use client';
import type { RuntimeProps } from '@/lib/types';
import React, { useMemo, useRef, useEffect } from 'react';
import * as Plot from '@observablehq/plot';
import { useValue, useAggregate, componentFieldByStateKey } from '@/lib/state';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { DisplayError } from '@/lib/util/debug';

export type DataRow = { category: string; series: string; value: number };

export type ParseResult = {
  rows: DataRow[];
  /** Tokens we could not read as numbers, reported back to the student. */
  rejected: { series: string; token: string }[];
  /**
   * Series that are missing entirely, or that hold the wrong number of values.
   *
   * Per-token validation is not sufficient on its own. A series left blank, or
   * one holding fewer values than there are categories, still plots cleanly —
   * it simply has fewer marks — so an omission is invisible at exactly the
   * moment the person entering the data could still fix it. Reporting it keeps
   * the chart honest about what it is not showing.
   */
  incomplete: { series: string; kind: 'empty' | 'count'; got: number; expected: number }[];
};

/** Split an authored comma-separated attribute into trimmed, non-empty parts. */
function splitList(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Turn the raw text of each series input into plottable rows.
 *
 * Students type "8, 10, 8, 12" — but also "8 10 8 12", or with a trailing
 * comma, or one number per line. All of those are accepted. Anything that
 * isn't a number is collected into `rejected` rather than silently dropped:
 * this is an assignment about presenting your data accurately, so a typo
 * that quietly vanishes from the chart is worse than one that's called out.
 */
export function parseSeries(
  texts: string[],
  labels: string[],
  categories: string[]
): ParseResult {
  const rows: DataRow[] = [];
  const rejected: { series: string; token: string }[] = [];
  const counts: { series: string; got: number }[] = [];

  texts.forEach((text, seriesIndex) => {
    const seriesName = labels[seriesIndex] || `Series ${seriesIndex + 1}`;
    const tokens = String(text ?? '')
      .split(/[\s,;]+/)
      .map(t => t.trim())
      .filter(Boolean);

    let kept = 0;
    tokens.forEach((token, pointIndex) => {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        rejected.push({ series: seriesName, token });
        return;
      }
      kept++;
      rows.push({
        category: categories[pointIndex] || String(pointIndex + 1),
        series: seriesName,
        value,
      });
    });
    counts.push({ series: seriesName, got: kept });
  });

  // Completeness is only reportable against a known shape, so it needs authored
  // categories to compare with; and it is only worth reporting once there is
  // some data, since every series is legitimately empty before anyone has typed
  // anything and warning then would be noise.
  const expected = categories.length;
  const anyData = rows.length > 0;
  const incomplete: ParseResult['incomplete'] = [];
  if (expected > 0 && anyData) {
    for (const { series, got } of counts) {
      if (got === 0) {
        incomplete.push({ series, kind: 'empty', got, expected });
      } else if (got !== expected) {
        incomplete.push({ series, kind: 'count', got, expected });
      }
    }
  }

  return { rows, rejected, incomplete };
}

export default function _SelfMonitorPlot(props: RuntimeProps) {
  const {
    target, labels, categories, type = 'bar',
    chartTitle, xlabel, ylabel,
    chartTitleTarget, xlabelTarget, ylabelTarget, labelsTarget,
    width, height,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const targetRefs = Array.isArray(target) ? target : target ? [target] : [];

  // `target` is required by the schema, so an empty list means the block was
  // authored wrong and never had state to read. Bail before the hooks rather
  // than after: useAggregate asserts on its field descriptor, and there is no
  // valid descriptor to build without at least one target. Hook order stays
  // stable because `target` is a static authored attribute — it cannot change
  // between renders of a given instance.
  if (targetRefs.length === 0) {
    return <DisplayError props={props} title="SelfMonitorPlot" message="No target specified" />;
  }

  // Resolve each series input to a StateKey, then read them all in one
  // subscription. NOTE: useAggregate reads the raw Redux field, which does
  // not fall back to a block's authored starter text the way selectValue
  // does — so series inputs must use placeholder=, not child text, or the
  // placeholder would plot as though the student had typed it.
  const keyCacheKey = targetRefs.map(String).join('|');
  const stateKeys = useMemo(
    () => targetRefs.map(ref => stateKeyForGlobalRef(ref, props.runtime.ns)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyCacheKey, props.runtime.ns]
  );

  const valueField = componentFieldByStateKey(props, stateKeys[0], 'value');
  const seriesTexts = useAggregate(props, valueField, stateKeys, { fallback: '' });

  // Reactive label reads. These hooks run unconditionally to keep hook order
  // stable; the results are only consulted when the matching *Target was set.
  const liveTitle = useValue(props, { target: chartTitleTarget, fallback: '' });
  const liveXlabel = useValue(props, { target: xlabelTarget, fallback: '' });
  const liveYlabel = useValue(props, { target: ylabelTarget, fallback: '' });
  const liveLabels = useValue(props, { target: labelsTarget, fallback: '' });

  const resolvedTitle = (chartTitleTarget ? String(liveTitle.value || '') : '') || chartTitle || '';
  const resolvedXlabel = (xlabelTarget ? String(liveXlabel.value || '') : '') || xlabel || '';
  const resolvedYlabel = (ylabelTarget ? String(liveYlabel.value || '') : '') || ylabel || '';

  // Series names deliberately do NOT fall back to the authored `labels` once a
  // labelsTarget is wired: naming the series IS writing the legend, so a
  // student who has not named them should see "Series 1..n" on their own chart
  // rather than a correct legend the page supplied for them.
  const resolvedLabels = labelsTarget ? String(liveLabels.value || '') : labels;
  const labelList = useMemo(() => splitList(resolvedLabels), [resolvedLabels]);
  const categoryList = useMemo(() => splitList(categories), [categories]);

  const { rows, rejected, incomplete } = useMemo(
    () => parseSeries(
      Array.isArray(seriesTexts) ? seriesTexts : [],
      labelList,
      categoryList
    ),
    [seriesTexts, labelList, categoryList]
  );

  const plotNode = useMemo(() => {
    if (rows.length === 0) return null;

    // Keep the authored category order (Sun..Sat, not alphabetical). When no
    // categories were authored, fall back to first-seen order.
    const domain = categoryList.length
      ? categoryList
      : [...new Set(rows.map(r => r.category))];

    const common = {
      width: width || undefined,
      height: height || 320,
      ...(resolvedTitle ? { title: resolvedTitle } : {}),
      y: { label: resolvedYlabel || null, grid: true },
      color: { legend: true },
    };

    if (type === 'line') {
      return Plot.plot({
        ...common,
        x: { domain, label: resolvedXlabel || null },
        marks: [
          Plot.line(rows, { x: 'category', y: 'value', stroke: 'series' }),
          Plot.dot(rows, { x: 'category', y: 'value', fill: 'series', r: 3 }),
          Plot.ruleY([0]),
        ],
      });
    }

    // Grouped bars: one facet per category, bars within a facet by series.
    return Plot.plot({
      ...common,
      fx: { domain, label: resolvedXlabel || null },
      x: { axis: null },
      marks: [
        Plot.barY(rows, { fx: 'category', x: 'series', y: 'value', fill: 'series' }),
        Plot.ruleY([0]),
      ],
    });
  }, [rows, categoryList, type, resolvedTitle, resolvedXlabel, resolvedYlabel, width, height]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (plotNode) containerRef.current.replaceChildren(plotNode);
    else containerRef.current.replaceChildren();
  }, [plotNode]);

  const minHeight = height || 320;

  const missing = incomplete.filter(i => i.kind === 'empty');
  const miscounted = incomplete.filter(i => i.kind === 'count');

  const warnings = (rejected.length || incomplete.length) ? (
    <div style={{ marginTop: 8, fontSize: '0.9em', color: '#a33' }}>
      {rejected.length > 0 && (
        <div>
          Could not read {rejected.length === 1 ? 'this entry' : 'these entries'} as
          {' '}{rejected.length === 1 ? 'a number' : 'numbers'}, so
          {' '}{rejected.length === 1 ? 'it is' : 'they are'} not on the chart:{' '}
          {rejected.map(r => `"${r.token}" (${r.series})`).join(', ')}
        </div>
      )}
      {missing.length > 0 && (
        <div>
          Nothing entered yet for {missing.map(i => i.series).join(', ')} —
          {' '}{missing.length === 1 ? 'that series is' : 'those series are'} missing
          {' '}from the chart entirely.
        </div>
      )}
      {miscounted.map(i => (
        <div key={i.series}>
          {i.series} has {i.got} {i.got === 1 ? 'value' : 'values'} but the chart
          {' '}expects {i.expected}
          {i.got < i.expected
            ? ` — the last ${i.expected - i.got} ${i.expected - i.got === 1 ? 'is' : 'are'} missing.`
            : ` — the extra ${i.got - i.expected} ${i.got - i.expected === 1 ? 'is' : 'are'} plotted without a label.`}
        </div>
      ))}
    </div>
  ) : null;

  if (!plotNode) {
    return (
      <div>
        <div style={{
          minHeight,
          border: '1px dashed #ccc',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          padding: 16,
          textAlign: 'center',
        }}>
          Your graph will appear here once you enter your numbers above.
        </div>
        {warnings}
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} style={{ minHeight }} />
      {warnings}
    </div>
  );
}
