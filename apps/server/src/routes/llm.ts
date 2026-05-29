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
function toResponse(c: Context, result: LLMProxyResult, onUsage?: (tokens: number) => void): Response {
  switch (result.kind) {
    case 'json':
      return c.json(result.data);
    case 'passthrough': {
      const contentType = result.response.headers.get('content-type') || 'application/json';
      const isStreaming = contentType.includes('text/event-stream');
      const body = onUsage && result.response.body
        ? trackPassthroughUsage(result.response.body, isStreaming, onUsage)
        : result.response.body;
      return new Response(body, {
        status: result.response.status,
        headers: { 'Content-Type': contentType },
      });
    }
    case 'error':
      return c.json(
        { error: result.error, ...(result.details && { details: result.details }) },
        result.status as any,
      );
  }
}

/**
 * Wrap a passthrough response body to extract token usage.
 *
 * For streaming (SSE): passes every chunk through unchanged, buffers the
 * text, and on flush parses the last SSE `data:` line containing usage.
 *
 * For non-streaming (JSON): buffers the full body, parses usage from the
 * JSON response, then forwards the body unchanged.
 */
function trackPassthroughUsage(
  body: ReadableStream<Uint8Array>,
  isStreaming: boolean,
  onUsage: (tokens: number) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
    },
    flush() {
      buffer += decoder.decode();  // flush the decoder
      const tokens = isStreaming
        ? extractUsageFromSSE(buffer)
        : extractUsageFromJSON(buffer);
      if (tokens > 0) onUsage(tokens);
    },
  }));
}

/** Extract total_tokens from the last SSE data line that contains usage. */
function extractUsageFromSSE(buffer: string): number {
  const lines = buffer.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const data = JSON.parse(line.slice(6));
      if (data.usage?.total_tokens) return data.usage.total_tokens;
    } catch { /* not valid JSON, skip */ }
  }
  return 0;
}

/** Extract total_tokens from a JSON response body. */
function extractUsageFromJSON(buffer: string): number {
  try {
    const data = JSON.parse(buffer);
    return data.usage?.total_tokens ?? 0;
  } catch {
    return 0;
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
    const result = await dispatchLLMProxy(body, llmConfig.provider, llmConfig.model);

    // --- Record token usage (post-call, never rejects) -----------------------
    // For JSON results (bedrock/stub), usage is available immediately.
    // For passthrough results (openai/azure), usage is extracted from the
    // response body via trackPassthroughUsage (streaming or non-streaming).
    if (result.kind === 'json') {
      const totalTokens = result.data?.usage?.total_tokens ?? 0;
      if (totalTokens > 0) {
        await recordTokenUsage(kvs, safeUserId, totalTokens);
      }
    }

    const onUsage = (tokens: number) => {
      // Fire-and-forget — the response has already been sent/is streaming.
      recordTokenUsage(kvs, safeUserId, tokens).catch((err) => {
        console.error('[LLM] Failed to record token usage:', err);
      });
    };

    return toResponse(c, result, onUsage);
  };
}
