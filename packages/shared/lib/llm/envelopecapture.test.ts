// CAPTURE THE REQUEST ENVELOPE THE APP PUTS ON THE WIRE.
//
// promptcapture.test.ts records the prompt and schema -- the CONTENT of the
// call. This records the envelope AROUND them: every other key in the POST
// body. That is the last place an engine difference could hide once the prompt,
// the schema, the reading of the response and the arithmetic over it are all
// known identical, and nothing compared it: a differing `model`, token cap or
// sampling parameter would move every score while leaving the prompt audit
// perfectly clean.
//
// `fetch` is mocked, so this sends nothing and spends nothing. `callLLM` is
// driven directly rather than through a rendered screen, because the envelope
// does not depend on the content -- a fixed probe prompt isolates the envelope
// from the prompt comparison that already exists.
//
//   RUN_ENVELOPE_CAPTURE=1 ENVELOPE_OUT=... \
//   npx vitest run packages/shared/lib/llm/envelopecapture.test.ts
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { callLLM } from '@/lib/llm/reduxClient';

describe('envelope capture', () => {
  it('records the POST body the app builds', async () => {
    if (process.env.RUN_ENVELOPE_CAPTURE !== '1') return;
    let captured: any = null, url: any = null, init: any = null;
    vi.stubGlobal('fetch', async (u: any, i: any) => {
      url = String(u); init = i; captured = JSON.parse(i.body);
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: '{}' } }] }),
        text: async () => '{"choices":[{"message":{"content":"{}"}}]}',
      } as any;
    });
    await callLLM({
      prompt: 'PROBE',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'feedback_checks', strict: true,
                       schema: { type: 'object', properties: {}, required: [],
                                 additionalProperties: false } },
      },
      activityId: 'PROBE_ACTIVITY',
      statusCallback: () => null,
    });
    writeFileSync(process.env.ENVELOPE_OUT!, JSON.stringify({
      url, method: init?.method, headers: init?.headers, body: captured,
    }));
    expect(captured).toBeTruthy();
  });
});
