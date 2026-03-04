// src/instrumentation.ts
//
// Next.js instrumentation hook - runs once on server startup.
// Used for early validation of configuration.

export async function register() {
  // Only run on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateProviderOrExit } = await import('@/lib/llm/provider');
    validateProviderOrExit();
  }
}
