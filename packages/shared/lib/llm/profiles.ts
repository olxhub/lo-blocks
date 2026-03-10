// src/lib/llm/profiles.ts
//
// Named LLM profiles. Callers specify intent ('translation', 'interactive'),
// not raw parameters. The mapping from name to config is a stepping stone
// toward PMSS-based resolution, where profiles will cascade through
// institution, course, and user-level overrides.
//
// Profiles may eventually control model, provider, rate limits, and more.
// For now, only maxTokens varies across use cases.

export type LLMProfileConfig = {
  maxTokens: number;
  // Future: model, provider, temperature, rateLimits, ...
};

const PROFILES = {
  translation: { maxTokens: 16384 },
  interactive:  { maxTokens: 4096 },
} satisfies Record<string, LLMProfileConfig>;

export type LLMProfile = keyof typeof PROFILES;

/**
 * Resolve a named profile to its configuration.
 *
 * Throws on unknown profile names — callers should use well-known names,
 * not user-supplied strings, unless validated first.
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
