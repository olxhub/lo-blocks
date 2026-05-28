// src/lib/llm/serverCall.ts
//
// Server-side LLM call: (profile, messages) → text string.
//
// Shared by translate module and any future server-side LLM callers.
// The proxy routes (Hono, Next.js) have different needs (streaming,
// tool calls, Response passthrough) — they use dispatchLLMProxy from proxy.ts.

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
import { resolveProfile, type LLMProfile, type LLMProfileConfig } from '@/lib/llm/profiles';
import { transformToAnthropic } from '@/lib/llm/proxy';

type Message = { role: string; content: string };
export type LLMResult = { text: string; truncated: boolean };

/**
 * Call the configured LLM provider with a named profile and messages array.
 *
 * The profile selects parameters (maxTokens, etc.) — callers express intent,
 * not raw configuration.
 *
 * Throws on stub mode, unknown profiles, API errors, or empty responses.
 */
export async function callLLM(profile: LLMProfile, messages: Message[]): Promise<LLMResult> {
  const { provider, error } = getProvider();
  const config = resolveProfile(profile);

  if (error) {
    throw new Error(`LLM configuration error: ${error}`);
  }

  switch (provider) {
    case 'stub':
      throw new Error('LLM is in stub mode — no real provider available');
    case 'bedrock':
      return bedrockCall(config, messages);
    case 'openai':
      return openaiCall(config, messages);
    case 'azure':
      return azureCall(config, messages);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// TODO(bedrock-multi-model): Anthropic-only — see proxy.ts for details.
async function bedrockCall(config: LLMProfileConfig, messages: Message[]): Promise<LLMResult> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  const { system, messages: anthropicMessages } = transformToAnthropic(messages);

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: config.maxTokens,
    messages: anthropicMessages,
    ...(system && { system }),
  };

  const command = new InvokeModelCommand({
    modelId: AWS_BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const truncated = result.stop_reason === 'max_tokens';
  const textParts = result.content?.filter((c: any) => c.type === 'text') || [];
  return { text: textParts.map((t: any) => t.text).join(''), truncated };
}

async function openaiCall(config: LLMProfileConfig, messages: Message[]): Promise<LLMResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }

  const response = await fetch(`${OPENAI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: OPENAI_MODEL, messages, max_completion_tokens: config.maxTokens }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const truncated = data.choices?.[0]?.finish_reason === 'length';
  return { text: data.choices?.[0]?.message?.content || '', truncated };
}

async function azureCall(config: LLMProfileConfig, messages: Message[]): Promise<LLMResult> {
  const url = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_completion_tokens: config.maxTokens }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const truncated = data.choices?.[0]?.finish_reason === 'length';
  return { text: data.choices?.[0]?.message?.content || '', truncated };
}
