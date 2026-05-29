// packages/shared/lib/llm/proxy.ts
//
// Framework-agnostic LLM provider dispatch.
//
// Handles the actual provider calls (bedrock, openai, azure, stub) and
// message format transforms. Returns results that any HTTP framework
// (Hono, Next.js, Express) can wrap into its own response type.
//
// Three consumers:
//   - Hono route (apps/server/src/routes/llm.ts)
//   - Next.js route (apps/web/app/api/llm/chat/completions/route.js)
//   - serverCall.ts (server-side text-only calls — uses a subset)

import {
  getProvider,
  AWS_BEDROCK_MODEL,
  AWS_REGION,
  AZURE_API_KEY,
  AZURE_DEPLOYMENT_ID,
  AZURE_API_VERSION,
  AZURE_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_BASE_URL,
} from '@/lib/llm/provider';

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Provider returned a parsed JSON object (bedrock, stub). */
type JsonResult = { kind: 'json'; data: any };

/** Provider returned a raw fetch Response — pass through for streaming (openai, azure). */
type PassthroughResult = { kind: 'passthrough'; response: Response };

/** Provider call failed. */
type ErrorResult = { kind: 'error'; status: number; error: string; details?: string };

export type LLMProxyResult = JsonResult | PassthroughResult | ErrorResult;

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGE TRANSFORMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transform OpenAI-format messages to Anthropic format.
 * Extracts system messages, converts tool calls/results.
 */
export function transformToAnthropic(messages: any[]): {
  system: string | null;
  messages: any[];
} {
  let system: string | null = null;
  const transformed: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = system ? system + '\n' + msg.content : msg.content;
    } else if (msg.role === 'tool') {
      transformed.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        }],
      });
    } else if (msg.tool_calls) {
      const content: any[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
      transformed.push({ role: 'assistant', content });
    } else {
      transformed.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages: transformed };
}

/**
 * Transform Anthropic response to OpenAI chat completion format.
 */
export function transformToOpenAI(result: any): any {
  const message: any = { role: 'assistant', content: null };

  const textParts = result.content?.filter((c: any) => c.type === 'text') || [];
  if (textParts.length) {
    message.content = textParts.map((t: any) => t.text).join('');
  }

  const toolUses = result.content?.filter((c: any) => c.type === 'tool_use') || [];
  if (toolUses.length) {
    message.tool_calls = toolUses.map((tu: any) => ({
      id: tu.id,
      type: 'function',
      function: {
        name: tu.name,
        arguments: JSON.stringify(tu.input),
      },
    }));
  }

  return {
    id: result.id || 'bedrock-completion',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: AWS_BEDROCK_MODEL,
    choices: [{
      index: 0,
      message,
      finish_reason: result.stop_reason === 'end_turn' ? 'stop' : result.stop_reason,
    }],
    usage: {
      prompt_tokens: result.usage?.input_tokens || 0,
      completion_tokens: result.usage?.output_tokens || 0,
      total_tokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER DISPATCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dispatch an OpenAI-format request body to the configured LLM provider.
 *
 * Returns a discriminated union so the caller can wrap the result in its
 * own response type (NextResponse, Hono c.json(), etc.).
 *
 * The `body` should already have profile resolved to max_completion_tokens
 * and the profile field stripped.
 */
export async function dispatchLLMProxy(body: any): Promise<LLMProxyResult> {
  const { provider, error } = getProvider();

  if (error) {
    return { kind: 'error', status: 500, error: `LLM configuration error: ${error}` };
  }

  switch (provider) {
    case 'stub':
      console.log('[LLM] Using stub provider');
      return { kind: 'json', data: buildStubResponse(body) };
    case 'bedrock':
      return bedrockCall(body);
    case 'openai':
      return openaiCall(body);
    case 'azure':
      return azureCall(body);
    default:
      return { kind: 'error', status: 500, error: `Unknown provider: ${provider}` };
  }
}

// --- Bedrock -----------------------------------------------------------------
//
// TODO(bedrock-multi-model): This function assumes Anthropic Claude — the
// request body format (anthropic_version, separate system field, Anthropic
// content blocks, tool schema shape) and response parsing (transformToOpenAI)
// are all Anthropic-specific.  Non-Anthropic Bedrock models (openai.gpt-oss-*,
// Kimi, Titan, etc.) use entirely different request/response schemas.  If
// AWS_BEDROCK_MODEL is set to a non-Anthropic model, this will send a
// malformed request.  Fix: detect model prefix (e.g. "anthropic." vs
// "openai." vs "amazon.") and branch to the appropriate request builder.

async function bedrockCall(body: any): Promise<LLMProxyResult> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import(
    '@aws-sdk/client-bedrock-runtime'
  );

  const client = new BedrockRuntimeClient({ region: AWS_REGION });
  const { system, messages } = transformToAnthropic(body.messages);

  const bedrockBody: any = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: body.max_completion_tokens || 4096,  // Translate OpenAI field → Anthropic field
    messages,
    ...(system && { system }),
  };

  if (body.tools?.length) {
    bedrockBody.tools = body.tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const command = new InvokeModelCommand({
    modelId: AWS_BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(bedrockBody),
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));

  return { kind: 'json', data: transformToOpenAI(result) };
}

// --- OpenAI (and compatible: Ollama, OpenRouter, etc.) -----------------------

async function openaiCall(body: any): Promise<LLMProxyResult> {
  body.model = OPENAI_MODEL;
  if (body.stream) {
    body.stream_options = { ...body.stream_options, include_usage: true };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }

  const response = await fetch(`${OPENAI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return { kind: 'passthrough', response };
}

// --- Azure OpenAI ------------------------------------------------------------

async function azureCall(body: any): Promise<LLMProxyResult> {
  if (body.stream) {
    body.stream_options = { ...body.stream_options, include_usage: true };
  }

  const url = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[LLM] Azure API error (${response.status}): ${errorBody}`);
    return { kind: 'error', status: response.status, error: `Azure API error: ${response.status}`, details: errorBody };
  }

  return { kind: 'passthrough', response };
}

// --- Stub --------------------------------------------------------------------

/**
 * Build an OpenAI-format stub response (plain object, not a Response).
 */
export function buildStubResponse(body: any): any {
  const messages = body.messages || [];
  const userMessage = messages.find((m: any) => m.role === 'user')?.content || 'Hello';
  const preview = userMessage.substring(0, 150) + (userMessage.length > 150 ? '...' : '');

  let responseText;
  const lower = userMessage.toLowerCase();
  if (lower.includes('comedian')) {
    responseText = `[STUB COMEDIAN] "${preview}" → "Why did the student write this? Because they had something important to say... and I'm making it funny!"`;
  } else if (lower.includes('first grader')) {
    responseText = `[STUB FIRST GRADER] "${preview}" → "This is easy words for little kids to read!"`;
  } else if (lower.includes('business')) {
    responseText = `[STUB BUSINESS] "${preview}" → "We are pleased to leverage synergistic solutions..."`;
  } else if (lower.includes('legal')) {
    responseText = `[STUB LEGAL] "${preview}" → "Whereas the aforementioned content, hereinafter referred to as..."`;
  } else if (lower.includes('academic')) {
    responseText = `[STUB ACADEMIC] "${preview}" → "The hermeneutical implications of the aforementioned discourse..."`;
  } else {
    responseText = `[STUB] Processed: "${preview}"`;
  }

  return {
    id: 'stub-completion-id',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'stub',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: responseText },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}
