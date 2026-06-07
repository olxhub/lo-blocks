// apps/web/app/api/llm/chat/completions/route.js
//
// POST /api/llm/chat/completions
//
// Proxy for chat completions. Client sends OpenAI format, server routes to configured provider.
// See docs/llm-setup.md for configuration.
//
// Thin Next.js wrapper around the shared LLM proxy (packages/shared/lib/llm/proxy.ts).
// Adds profile resolution via PMSS; delegates provider dispatch to the shared module.
//
// PMSS is initialized in instrumentation.ts (server runtime only).

import { NextResponse } from 'next/server';
import { resolveLLMConfigWithFallback } from '@/lib/llm/profiles';
import { dispatchLLMProxy } from '@/lib/llm/proxy';

export async function POST(request) {
  const body = await request.json();

  // Resolve profile via PMSS
  const profileName = body.profile || 'interactive';
  let llmConfig;
  try {
    llmConfig = resolveLLMConfigWithFallback(profileName);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  body.max_completion_tokens = body.max_completion_tokens || llmConfig.maxTokens;
  delete body.profile;

  const result = await dispatchLLMProxy(body, llmConfig.provider, llmConfig.model);

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
