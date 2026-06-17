// packages/shared/lib/translate/runTranslation.ts
//
// Shared in-flight dedupe + timeout around translateBlock.
//
// Shared by both translate route handlers (apps/server Hono + apps/web
// Next.js), so the policy lives once:
//   - singleFlight coalesces concurrent identical requests (same source file +
//     target locale) onto one job — the second caller awaits the first's result
//   - timeout caps each job's wall time
//
// Module-level, so the dedupe is shared process-wide rather than per-route.

import { singleFlight, timeout } from '@/lib/util/async';
import { translateBlock, type TranslateBlockOptions, type TranslationResult } from './orchestrate';

/** Max wall time for a single translation job (10 minutes). */
const TRANSLATION_TIMEOUT_MS = 600_000;

const timedTranslate = timeout(translateBlock, TRANSLATION_TIMEOUT_MS);

/**
 * Translate a block, deduplicating concurrent identical in-flight requests and
 * enforcing a timeout. Concurrent callers for the same source file + target
 * locale share one job and receive the same result.
 */
export const runTranslation: (opts: TranslateBlockOptions) => Promise<TranslationResult> =
  singleFlight(timedTranslate, (opts) => `${opts.sourceFileUri}::${opts.targetLocale}`);
