// src/app/api/llm/chat/completions/route.js
//
// POST /api/llm/chat/completions
//
// Proxy for chat completions. Client sends OpenAI format, server routes to configured provider.
// See docs/llm-setup.md for configuration.
//
// Thin Next.js wrapper around the shared LLM proxy (packages/shared/lib/llm/proxy.ts).
// Adds profile resolution; delegates provider dispatch to the shared module.
//
// TODO: This route uses the hardcoded PROFILES map (resolveProfile) for
// maxTokens.  The Hono route uses PMSS (resolveLLMConfig) as the single
// source of truth.  Once PMSS is initialized in the Next.js app (add
// initConfig to instrumentation.ts), switch this route to resolveLLMConfig
// and remove the hardcoded PROFILES map from profiles.ts.

import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/llm/profiles';
import { dispatchLLMProxy } from '@/lib/llm/proxy';

export async function POST(request) {
  const body = await request.json();

  // Resolve profile to max_completion_tokens if not explicitly set.
  // Client can send { profile: 'interactive' } instead of { max_completion_tokens: 4096 }.
  if (!body.max_completion_tokens && !body.profile) {
    body.profile = 'interactive';
  }
  if (body.profile) {
    try {
      const config = resolveProfile(body.profile);
      body.max_completion_tokens = body.max_completion_tokens || config.maxTokens;
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    delete body.profile; // Don't forward to upstream provider
  }

  const result = await dispatchLLMProxy(body);

  switch (result.kind) {
    case 'json':
      return NextResponse.json(result.data);
    case 'passthrough':
      return new NextResponse(result.response.body, {
        status: result.response.status,
        headers: { 'Content-Type': result.response.headers.get('content-type') || 'application/json' },
      });
    case 'error':
      return NextResponse.json(
        { error: result.error, ...(result.details && { details: result.details }) },
        { status: result.status },
      );
  }
}
