// src/lib/llm/profiles.ts
//
// Named LLM profiles. Callers specify intent ('translation', 'interactive'),
// not raw parameters. The mapping from name to config is a stepping stone
// toward PMSS-based resolution, where profiles will cascade through
// institution, course, and user-level overrides.
//
// Two resolution paths:
//   1. resolveProfile() — static lookup from the hardcoded PROFILES map.
//      Used by the Next.js route and serverCall.ts (client-agnostic).
//   2. resolveLLMConfig() — PMSS-based resolution with profile as an
//      attribute selector. Used by the Hono LLM route. Env vars override
//      PMSS values so existing deployments keep working.

import { getConfig } from '@/lib/config';
import type { SelectorMatchContext } from 'pmss';
import {
  getProvider,
  AWS_BEDROCK_MODEL,
  OPENAI_MODEL,
} from '@/lib/llm/provider';

export type LLMProfileConfig = {
  maxTokens: number;
  // Future: model, provider, temperature, rateLimits, ...
};

// TODO: These values are duplicated in system.pmss (llm-max-tokens per
// profile).  Once the Next.js route switches to resolveLLMConfig() (needs
// initConfig in Next.js instrumentation.ts), remove this map and
// resolveProfile entirely — PMSS becomes the single source of truth.
const PROFILES = {
  translation: { maxTokens: 16384 },
  interactive:  { maxTokens: 4096 },
} satisfies Record<string, LLMProfileConfig>;

export type LLMProfile = keyof typeof PROFILES;

/**
 * Resolve a named profile to its configuration (static lookup).
 *
 * @deprecated Use resolveLLMConfig() when PMSS is available. This function
 * exists only for callers that don't have PMSS initialized (Next.js route,
 * serverCall.ts).
 */
export function resolveProfile(name: LLMProfile): LLMProfileConfig {
  const config = PROFILES[name];
  if (!config) {
    throw new Error(
      `Unknown LLM profile "${name}". Known profiles: ${Object.keys(PROFILES).join(', ')}`
    );
  }
  return config;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PMSS-BASED RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

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
 * Env vars override PMSS values: if LLM_PROVIDER is set (or detected via
 * getProvider()), it takes precedence over the PMSS llm-provider value.
 * Similarly, AWS_BEDROCK_MODEL / OPENAI_MODEL override llm-model.
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
  const context: SelectorMatchContext = {
    classes: ['server', ...authClass, ...classes],
    attributes: { profile },
  };

  const pmssProvider = getConfig('llm-provider', context) ?? 'stub';
  const pmssModel = getConfig('llm-model', context) ?? '';
  const pmssMaxTokens = parseInt(getConfig('llm-max-tokens', context) ?? '4096', 10);
  const pmssRpm = parseInt(getConfig('llm-rpm', context) ?? '20', 10);
  const pmssTokenBudget = parseInt(getConfig('llm-token-budget', context) ?? '100000', 10);

  // Env vars override PMSS — keeps existing deployments working.
  const { provider: envProvider } = getProvider();
  const provider = envProvider ?? pmssProvider;

  let model = pmssModel;
  if (provider === 'bedrock' && AWS_BEDROCK_MODEL) {
    model = AWS_BEDROCK_MODEL;
  } else if (provider === 'openai' && OPENAI_MODEL) {
    model = OPENAI_MODEL;
  }

  return {
    provider,
    model,
    maxTokens: pmssMaxTokens,
    rpm: pmssRpm,
    tokenBudget: pmssTokenBudget,
  };
}
