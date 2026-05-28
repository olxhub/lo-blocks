// routes/llm.ts
//
// LLM proxy endpoint: POST /api/llm/chat/completions
//
// Thin Hono wrapper around the shared LLM proxy (packages/shared/lib/llm/proxy.ts).
// Adds profile resolution via PMSS and per-user rate limiting; delegates
// provider dispatch to the shared module.

import type { Context } from 'hono';
import { resolveLLMConfig } from '@/lib/llm/profiles';
import { dispatchLLMProxy, type LLMProxyResult } from '@/lib/llm/proxy';
import type { KVStore } from '../kvs.js';
import type { AuthUser } from '../auth.js';
import { asSafeUserId } from '@/lib/types/identity';
import { checkRateLimit, checkTokenBudget, recordTokenUsage } from '../rateLimit.js';

// Sentinel identity for rate limiting when user resolution somehow fails.
// Should never happen (handleWithSession always creates a guest), but if it
// does, requests share a single restrictive bucket rather than getting
// unlimited access.
const ANONYMOUS_SAFE_ID = asSafeUserId('anonymous-fallback');

/** Wrap an LLMProxyResult into a web Response for Hono. */
function toResponse(c: Context, result: LLMProxyResult): Response {
  switch (result.kind) {
    case 'json':
      return c.json(result.data);
    case 'passthrough':
      return new Response(result.response.body, {
        status: result.response.status,
        headers: {
          'Content-Type': result.response.headers.get('content-type') || 'application/json',
        },
      });
    case 'error':
      return c.json(
        { error: result.error, ...(result.details && { details: result.details }) },
        result.status as any,
      );
  }
}

/**
 * Create the LLM route handler, closed over the KVS instance for rate limiting.
 */
export function createLLMHandler(kvs: KVStore) {
  return async function handleLLM(c: Context): Promise<Response> {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON in request body' }, 400);
    }

    // Resolve user — handleWithSession always sets __user (guest fallback),
    // but we handle the impossible case defensively rather than skipping
    // rate limiting.
    const user: AuthUser | undefined = (c.req.raw as any).__user;
    const safeUserId = user?.safe_user_id ?? ANONYMOUS_SAFE_ID;
    const authorized = user?.authorized ?? false;

    // --- Profile resolution (PMSS is the single source of truth) ------------
    // Auth status is included so PMSS can apply tighter limits for guests.
    const profileName = body.profile || 'interactive';
    let llmConfig;
    try {
      llmConfig = resolveLLMConfig(profileName, { authorized });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }

    body.max_completion_tokens = body.max_completion_tokens || llmConfig.maxTokens;
    delete body.profile;

    // --- Rate limiting (pre-call) --------------------------------------------
    const rateCheck = await checkRateLimit(kvs, safeUserId, llmConfig.rpm);
    if (!rateCheck.ok) {
      return c.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const budgetCheck = await checkTokenBudget(kvs, safeUserId, llmConfig.tokenBudget);
    if (!budgetCheck.ok) {
      return c.json({ error: 'LLM token budget exhausted.' }, 429);
    }

    // --- Dispatch to provider ------------------------------------------------
    const result = await dispatchLLMProxy(body);

    // --- Record token usage (post-call, never rejects) -----------------------
    if (result.kind === 'json') {
      const totalTokens = result.data?.usage?.total_tokens ?? 0;
      if (totalTokens > 0) {
        await recordTokenUsage(kvs, safeUserId, totalTokens);
      }
    }

    return toResponse(c, result);
  };
}
