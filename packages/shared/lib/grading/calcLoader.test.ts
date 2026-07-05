// @vitest-environment node
// packages/shared/lib/grading/calcLoader.test.ts
//
// The lazy math engine's self-healing contract. Must be its own test file:
// other math tests preload the engine in beforeAll, and worker isolation is
// what guarantees this file starts with the engine unloaded.
import { test, expect } from 'vitest';
import { requireCalc, ensureCalcLoaded } from './calcLoader';
import { numericalMatch } from './numerical';

test('requireCalc before load throws retriably AND starts the load', async () => {
  // Browsers rendering pre-parsed content can reach sync match functions
  // (when= expressions, RulesGrader rules) with the engine unloaded — the
  // miss must kick off loading so a retry succeeds, not fail permanently.
  expect(() => requireCalc()).toThrow(/loads on first use/);

  // The throw above must have started the load; awaiting the (idempotent)
  // loader resolves against that same in-flight load.
  await ensureCalcLoaded();

  // Sync paths now work without any explicit preload by the caller.
  expect(numericalMatch('4', '4')).toBe(true);
  expect(requireCalc().parseComplex('1+2i').im).toBe(2);
}, 30000); // 2026-07-04: this test deliberately starts with the engine
           // unloaded, so its body pays the full mathjs import — a few
           // seconds under full-suite CPU load, over the 5s default.
