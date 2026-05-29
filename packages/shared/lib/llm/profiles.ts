// src/lib/llm/profiles.ts
//
// LLM profile resolution via PMSS — single source of truth.
//
// Callers specify intent ('translation', 'interactive'), not raw parameters.
// PMSS rules in server.pmss (+ local.pmss overrides) resolve to concrete
// provider, model, and limits.
//
// Usage:
//   const config = resolveLLMConfig('interactive', { authorized: true });
//   const config = resolveLLMConfigWithFallback('translation');

import { getConfig, getDefaultClasses } from '@/lib/config';
import type { SelectorMatchContext } from 'pmss';
import {
  envModelFallback,
  availableProviders,
  validateProviderConfig,
} from '@/lib/llm/provider';

export type LLMResolvedConfig = {
  provider: string;
  model: string;
  maxTokens: number;
  rpm: number;
  tokenBudget: number;
};

/**
 * Resolve full LLM configuration for a profile via PMSS.
 *
 * Uses the profile name as a PMSS attribute selector:
 *   `.server[profile="interactive"]` matches when profile='interactive'.
 *
 * The default classes (from initConfig) include credential-availability
 * classes, so PMSS rules like `.llm_available_bedrock { llm-provider: bedrock; }`
 * activate automatically.
 *
 * If PMSS llm-model is empty, falls back to the env var for the selected
 * provider (e.g. AWS_BEDROCK_MODEL for bedrock, OPENAI_MODEL for openai).
 *
 * @param profile - Profile name (e.g. 'interactive', 'translation')
 * @param options.classes - Additional PMSS classes (e.g. from course manifest)
 * @param options.authorized - Whether the user is authenticated; adds 'authorized'
 *   or 'guest' class so PMSS can apply different limits per auth status
 */
export function resolveLLMConfig(
  profile: string,
  options: { classes?: string[]; authorized?: boolean } = {},
): LLMResolvedConfig {
  const { classes = [], authorized } = options;
  const authClass = authorized === undefined ? [] :
    authorized ? ['authorized'] : ['guest'];

  const baseClasses = getDefaultClasses();
  const context: SelectorMatchContext = {
    classes: [...baseClasses, ...authClass, ...classes],
    attributes: { profile },
  };

  const provider = getConfig('llm-provider', context) ?? 'stub';
  const pmssModel = getConfig('llm-model', context) ?? '';
  const maxTokens = parseInt(getConfig('llm-max-tokens', context) ?? '4096', 10);
  const rpm = parseInt(getConfig('llm-rpm', context) ?? '20', 10);
  const tokenBudget = parseInt(getConfig('llm-token-budget', context) ?? '100000', 10);

  // Fall back to env var model when PMSS doesn't specify one
  const model = pmssModel || envModelFallback(provider);

  return { provider, model, maxTokens, rpm, tokenBudget };
}

/**
 * Resolve LLM config with credential validation and fallback.
 *
 * If the PMSS-selected provider lacks credentials, falls back to any
 * provider that has them. If nothing is available, falls back to stub.
 *
 * All request-time callers should use this rather than resolveLLMConfig
 * directly, since PMSS may select a provider whose credentials are
 * incomplete (e.g. local.pmss override without matching env vars).
 */
export function resolveLLMConfigWithFallback(
  profile: string,
  options: { classes?: string[]; authorized?: boolean } = {},
): LLMResolvedConfig {
  const config = resolveLLMConfig(profile, options);

  const { ok } = validateProviderConfig(config.provider);
  if (ok) return config;

  // Try any available provider.
  //
  // TODO(per-provider-limits): The limits (maxTokens, rpm, tokenBudget)
  // carried forward here were resolved for the *original* provider. When
  // PMSS gains per-provider or per-model limit rules (e.g.
  // `[model="gpt-5.5"][role="admin"] { llm-token-budget: 500000; }`),
  // this fallback should re-resolve against the new provider/model context
  // rather than inheriting the original limits.
  const available = availableProviders();
  const fallback = available.find(p => p !== 'stub' && p !== config.provider);
  if (fallback) {
    console.warn(
      `[LLM] Provider "${config.provider}" has credential issues; ` +
      `falling back to "${fallback}"`
    );
    return {
      ...config,
      provider: fallback,
      model: envModelFallback(fallback),
    };
  }

  // Nothing available — stub
  if (config.provider !== 'stub') {
    console.warn(`[LLM] No providers with valid credentials; falling back to stub`);
  }
  return { ...config, provider: 'stub', model: '' };
}
