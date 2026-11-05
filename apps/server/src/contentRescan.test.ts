// apps/server/src/contentRescan.test.ts
//
// The setting decides whether a content scan sits on the websocket event
// path, so what is under test is the DEFAULT per environment (the thing a
// deploy gets without saying anything) and that an override is honored.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initConfig } from '@/lib/config';
import { readContentRescanMs, indexTtlFor } from './contentRescan.js';

const CONFIG_DIR = path.resolve(__dirname, '../../../config');
const PMSS = ['system.pmss', 'server.pmss']
  .map(f => fs.readFileSync(path.join(CONFIG_DIR, f), 'utf-8')).join('\n');

/** Initialize config the way loadServerConfig does, for one environment. */
function asServer(env: 'development' | 'production', extra = '') {
  initConfig([PMSS, extra].filter(Boolean).join('\n'), {
    types: ['server'], classes: ['server', env],
  });
}

describe('content-rescan-ms', () => {
  it('re-scans on an interval in development', () => {
    asServer('development');
    expect(readContentRescanMs()).toBe(2000);
  });

  it('is off in production — deployed content changes only in a deploy', () => {
    asServer('production');
    expect(readContentRescanMs()).toBe(0);
  });

  // Both defaults are overridable from local.pmss, which is why they are
  // written at one class or none: PMSS gives it to the higher specificity
  // and breaks ties in favor of the FIRST rule, while local.pmss is
  // concatenated last. A two-class override therefore always wins.
  it('lets an operator turn re-scanning back on in production', () => {
    asServer('production', '.server.production { content-rescan-ms: 5000; }');
    expect(readContentRescanMs()).toBe(5000);
  });

  it('lets a dev turn re-scanning off', () => {
    asServer('development', '.server.development { content-rescan-ms: 0; }');
    expect(readContentRescanMs()).toBe(0);
  });

  it('rejects a value that is not a whole number of milliseconds', () => {
    asServer('development', '.server.development { content-rescan-ms: soon; }');
    expect(() => readContentRescanMs()).toThrow(/non-negative integer/);
    asServer('development', '.server.development { content-rescan-ms: -1; }');
    expect(() => readContentRescanMs()).toThrow(/non-negative integer/);
  });
});

describe('indexTtlFor', () => {
  it('turns "never re-scan" into an infinite index TTL, not an expired one', () => {
    // 0 passed through would expire every lookup, rebuilding the routing
    // maps on every field write — the opposite of what 0 asks for.
    expect(indexTtlFor(0)).toBe(Number.POSITIVE_INFINITY);
    expect(Date.now() - 0 > indexTtlFor(0)).toBe(false);
  });

  it('passes an interval through unchanged', () => {
    expect(indexTtlFor(2000)).toBe(2000);
  });
});
