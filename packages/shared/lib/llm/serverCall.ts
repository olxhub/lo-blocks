// src/lib/llm/serverCall.ts
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

type Message = { role: string; content: string };
export type LLMResult = { text: string; truncated: boolean };

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
}
