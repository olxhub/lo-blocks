// packages/shared/lib/llm/serverCall.ts
//
// Server-side LLM call: (profile, messages) → text string.
//
// Shared by translate module and any future server-side LLM callers.
// Uses PMSS for provider/model resolution via resolveLLMConfigWithFallback,
// then delegates to dispatchLLMProxy.
//
// Requires PMSS to be initialized (initConfig) before use.

import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { dispatchLLMProxy } from '@/lib/llm/proxy';
import { withRetry, type RetryPolicy } from '@/lib/util/async';

type Message = { role: string; content: string };
export type LLMResult = { text: string; truncated: boolean };

// Retry transient provider failures (429 rate limits, 5xx, network errors).
// Permanent errors (4xx other than 429) surface immediately. Stub mode and
// config resolution sit OUTSIDE the retry — they're deterministic, not flaky.
const LLM_RETRY: RetryPolicy = {
  attempts: 3,
  baseMs: 500,
  maxMs: 8_000,
  retryable: isTransientLLMError,
};

/** Pull an HTTP status out of an "LLM API error (NNN): ..." message, if present. */
function statusOf(err: unknown): number | undefined {
  const m = /\((\d{3})\)/.exec(err instanceof Error ? err.message : String(err));
  return m ? Number(m[1]) : undefined;
}

function isTransientLLMError(err: unknown): boolean {
  const status = statusOf(err);
  if (status === undefined) return true;        // network/parse failure, no status → transient
  return status === 429 || status >= 500;       // rate-limited or server-side → transient
}

/**
 * Call the configured LLM provider with a named profile and messages array.
 *
 * The profile selects parameters (maxTokens, provider, model) via PMSS —
 * callers express intent, not raw configuration.
 *
 * Throws on stub mode, API errors, or empty responses.
 */
export async function callLLM(
  profile: string,
  messages: Message[],
): Promise<LLMResult> {
  const config = resolveLLMConfigWithFallback(profile);

  if (config.provider === 'stub') {
    throw new Error('LLM is in stub mode — no real provider available');
  }

  const body = {
    messages,
    max_completion_tokens: config.maxTokens,
    stream: false,
  };

  // One provider round-trip + response parse; retried on transient failures.
  const callOnce = async (): Promise<LLMResult> => {
    const result = await dispatchLLMProxy(body, config.provider, config.model);

    switch (result.kind) {
      case 'json': {
        const choice = result.data?.choices?.[0];
        const text = choice?.message?.content || '';
        const truncated = choice?.finish_reason === 'length' ||
                          choice?.finish_reason === 'max_tokens';
        return { text, truncated };
      }
      case 'passthrough': {
        if (!result.response.ok) {
          const errorBody = await result.response.text();
          throw new Error(
            `LLM API error (${result.response.status}): ${errorBody}`
          );
        }
        const data = await result.response.json();
        const choice = data?.choices?.[0];
        const text = choice?.message?.content || '';
        const truncated = choice?.finish_reason === 'length';
        return { text, truncated };
      }
      case 'error':
        throw new Error(`LLM API error (${result.status}): ${result.error}`);
    }
  };

  return withRetry(callOnce, LLM_RETRY)();
}
