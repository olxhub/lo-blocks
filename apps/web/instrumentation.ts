// src/instrumentation.ts
//
// Next.js instrumentation hook - runs once on server startup.
// Initializes PMSS config and validates LLM provider.

export async function register() {
  // Only run on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const fs = await import('fs');
    const { loadServerConfig } = await import('@/lib/config');
    const { validateProviderConfig } = await import('@/lib/llm/provider');
    const { resolveLLMConfig } = await import('@/lib/llm/profiles');

    loadServerConfig(fs.readFileSync);

    // Validate the resolved provider
    const config = resolveLLMConfig('interactive');
    const { ok, issues } = validateProviderConfig(config.provider);

    if (!ok && config.provider !== 'stub') {
      console.error(`\n  LLM configuration issues (provider: ${config.provider}):`);
      issues.forEach(issue => console.error(`    - ${issue}`));
      console.error(`\n  See docs/llm-setup.md for configuration options.\n`);
      process.exit(1);
    }

    if (config.provider === 'stub') {
      console.log('  LLM: stub mode (no real provider configured)');
    } else {
      console.log(`  LLM provider: ${config.provider}`);
    }
  }
}
