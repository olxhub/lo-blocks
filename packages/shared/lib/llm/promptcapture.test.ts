// @vitest-environment jsdom
// CAPTURE THE PROMPT THE APP ACTUALLY SENDS, without sending it.
//
// The audit compares the two engines' prompts in three pieces -- the served body
// (check_app_and_harness_send_the_same_prompt), the rubric elements
// (equivalence.py --item) and the response schema (schema_divergences). Nothing
// compares the ASSEMBLED STRING that goes on the wire, and that is the sliver
// this exists to close: `promptText + slotSheetGuidance(showChecks)` built by
// LLMAction against `build_prompt(body, fixture) + checklist_guidance(...)`
// built by agreement.py.
//
// It mocks `callLLMJson`, so it spends no tokens and touches no endpoint -- it
// records the first argument and returns an empty result. A SEPARATE FILE from
// runner.test.ts on purpose: the sweep launches a fresh vitest per item, so
// editing the runner mid-sweep would change what later items measure.
//
//   RUN_PROMPT_CAPTURE=1 JOBS_JSON=... IDMAP_JSON=... PROMPT_OUT=... \
//   npx vitest run packages/shared/lib/llm/promptcapture.test.ts
import React from 'react';
import { describe, it, beforeAll, vi, expect } from 'vitest';
import { Provider } from 'react-redux';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { readFileSync, writeFileSync } from 'fs';

const cap = vi.hoisted(() => ({ prompts: [] as string[], schemas: [] as string[] }));
vi.mock('@/lib/llm/reduxClient', async () => {
  const actual: any = await vi.importActual('@/lib/llm/reduxClient');
  return {
    ...actual,
    callLLMJson: async (prompt: string, schema: any) => {
      cap.prompts.push(prompt);
      cap.schemas.push(JSON.stringify(schema, null, 1));
      return { data: null, text: '' };
    },
  };
});

import { store } from '@/lib/state/store';
import { settings } from '@/lib/state/settings';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import RenderOLX from '@/components/common/RenderOLX';
import { initConfig } from '@/lib/config';

initConfig('* { allow-unsafe-content: true; }', { classes: ['client', 'test'] });

const ENABLED = process.env.RUN_PROMPT_CAPTURE === '1';
const JOBS = process.env.JOBS_JSON;
const IDMAP = process.env.IDMAP_JSON;
const OUT = process.env.PROMPT_OUT;

describe.skipIf(!ENABLED)('capture the assembled prompt', () => {
  let reduxStore: any;
  const jobs = ENABLED ? JSON.parse(readFileSync(JOBS!, 'utf-8')) : [];

  beforeAll(() => {
    reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false, extraFields: settings });
    const idMap = JSON.parse(readFileSync(IDMAP!, 'utf-8')).idMap;
    reduxStore.dispatch({
      redux_type: 'EMIT_EVENT', type: 'lo_event',
      payload: JSON.stringify({ event: 'LOAD_OLXJSON', source: 'content', blocks: idMap }),
    });
  });

  it('records what LLMAction would have sent, for every job', async () => {
    const out: Record<string, { prompt: string; schema: string }> = {};
    for (const job of jobs) {
      const before = cap.prompts.length;
      for (const [id, value] of Object.entries(job.fixture)) {
        reduxStore.dispatch({
          redux_type: 'EMIT_EVENT', type: 'lo_event',
          payload: JSON.stringify({ event: 'UPDATE_VALUE', scope: 'component', id: `${job.ns}/${id}`, value }),
        });
      }
      try {
        await act(async () => {
          render(React.createElement(Provider, { store: reduxStore } as any,
            React.createElement(RenderOLX as any, { id: job.screen, ns: job.ns })));
          await new Promise(r => setTimeout(r, 300));
        });
        // A derived item has no button and makes no call: it contributes no
        // request, which is a fact about the item and not a failure here.
        if (!job.button) { cleanup(); continue; }
        const button = await screen.findByRole(
          'button', { name: new RegExp(job.button, 'i') }, { timeout: 20_000 });
        await act(async () => { fireEvent.click(button); await new Promise(r => setTimeout(r, 400)); });
      } catch (e: any) {
        out[job.cell] = { prompt: '', schema: `__ERROR__ ${e?.message ?? e}` };
        cleanup();
        continue;
      }
      // RECORDED AGAINST THE CELL, and only when this job actually produced a
      // request. Reusing the last capture would silently attribute one item's
      // prompt to another, which is the failure this whole check exists to catch.
      if (cap.prompts.length > before) {
        out[job.cell] = {
          prompt: cap.prompts[cap.prompts.length - 1],
          schema: cap.schemas[cap.schemas.length - 1],
        };
      }
      cleanup();
    }
    expect(Object.keys(out).length).toBeGreaterThan(0);
    writeFileSync(OUT!, JSON.stringify(out, null, 1));
    console.log(`[capture] ${Object.keys(out).length} request(s) -> ${OUT}`);
  }, 600_000);
});
