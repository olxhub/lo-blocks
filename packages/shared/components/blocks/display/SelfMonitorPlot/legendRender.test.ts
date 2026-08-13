// @vitest-environment jsdom
// Does the student's own legend reach their own chart?
//
// SelfMonitorPlot's `labelsTarget` is what makes item
// 1c's legend the student's work rather than the page's, which is the whole
// reason the paper rubric's legend check is scoreable in the web version. That
// only holds if the names they type actually key the plot — so this renders the
// real 1c screen with seeded fields and reads the series names back out of the
// rendered SVG.
//
// It also pins the deliberate NON-fallback: with `labelsTarget` wired and the
// input empty, the series must come back as "Series 1..4", not as author-
// supplied week names. Falling back would hand the student a correct legend
// they did not write and make the check unanswerable.
//
//   IDMAP_JSON=idmap.json npx vitest run \
//     packages/shared/components/blocks/display/SelfMonitorPlot/legendRender.test.ts

import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { Provider } from 'react-redux';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';

import { store } from '@/lib/state/store';
import { settings } from '@/lib/state/settings';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import RenderOLX from '@/components/common/RenderOLX';

const IDMAP = process.env.IDMAP_JSON;
const NS = 'psych';
const SCREEN = 'psych/bmod_h3_graph';

const DATA = {
  bmod_h3_baseline: '5, 6, 5, 6, 4, 6, 7',
  bmod_h3_wk1: '6, 7, 6, 7, 6, 7, 8',
  bmod_h3_wk2: '7, 7, 8, 7, 8, 7, 8',
  bmod_h3_wk3: '8, 8, 7, 8, 8, 7, 8',
  bmod_h3_graph_title: 'Hours of Sleep Over Four Weeks',
  bmod_h3_graph_x: 'Days of the Week',
  bmod_h3_graph_y: 'Hours of Sleep',
};

describe.skipIf(!IDMAP)('1c: the student writes their own legend', () => {
  let reduxStore: any;

  beforeAll(() => {
    reduxStore = store.init({
      blockRegistry: BLOCK_REGISTRY,
      websocket: false,
      extraFields: settings,
    });
    const idMap = JSON.parse(readFileSync(IDMAP!, 'utf-8')).idMap;
    reduxStore.dispatch({
      redux_type: 'EMIT_EVENT', type: 'lo_event',
      payload: JSON.stringify({ event: 'LOAD_OLXJSON', source: 'content', blocks: idMap }),
    });
  });

  async function renderWith(fixture: Record<string, string>): Promise<string> {
    cleanup();
    for (const [id, value] of Object.entries(fixture)) {
      reduxStore.dispatch({
        redux_type: 'EMIT_EVENT', type: 'lo_event',
        payload: JSON.stringify({
          event: 'UPDATE_VALUE', scope: 'component', id: `${NS}/${id}`, value,
        }),
      });
    }
    let host: any;
    await act(async () => {
      host = render(
        React.createElement(
          Provider, { store: reduxStore } as any,
          React.createElement(RenderOLX as any, { id: SCREEN, ns: NS }),
        ),
      );
      await new Promise(r => setTimeout(r, 500));
    });
    // The worked example is on this screen too, so read only the student's plot.
    // Two figures render on this screen: the worked example first (an
    // ObservablePlot with fixed water data) and the student's second. Blocks do
    // not put their id on the DOM node, so pick the student's by position and
    // assert the example is still the other one, which also guards against
    // silently reading the example when the student's plot fails to render.
    const figs = [...host.container.querySelectorAll('figure')];
    expect(figs.length, 'expected the worked example AND the student plot').toBe(2);
    const clean = (n: any) => (n.textContent ?? '').replace(/:where\([^}]*\}/g, '');
    expect(clean(figs[0]), 'figure 0 should be the worked example')
      .toContain('Water Consumption Over Four Weeks');
    return clean(figs[1]);
  }

  it('keys the chart off the series names the student typed', async () => {
    const text = await renderWith({
      ...DATA,
      bmod_h3_graph_series: 'Before, Trial 1, Trial 2, Trial 3',
    });
    for (const name of ['Before', 'Trial 1', 'Trial 2', 'Trial 3']) {
      expect(text, `legend is missing "${name}"`).toContain(name);
    }
    expect(text, 'their own axis label missing').toContain('Hours of Sleep');
    // Their names, not the ones the page used to supply.
    expect(text).not.toContain('Series 1');
  });

  it('shows Series 1..n — not author-supplied week names — when unnamed', async () => {
    const text = await renderWith({
      ...DATA, bmod_h3_graph_series: '',
    });
    expect(text, 'an unnamed series should read "Series 1"').toContain('Series 1');
    expect(
      text,
      'the page must not hand the student a legend they did not write',
    ).not.toContain('Baseline');
  });
});
