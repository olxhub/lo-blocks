// src/lib/llm/serverCall.ts
//
// Server-side LLM call: messages → text string.
//
// Shared by translate/route.ts and any future server-side LLM callers.
// The openai proxy route (api/openai) has different needs (streaming,
// tool calls, NextResponse passthrough) so it doesn't use this.

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

type Message = { role: string; content: string };

/**
 * Call the configured LLM provider with a messages array, return the text response.
 *
 * Throws on stub mode (callers should check getProvider().provider === 'stub' first
 * if they want to handle stub gracefully).
 *
 * Throws on API errors or empty responses.
 */
export async function callLLM(messages: Message[]): Promise<string> {
  const { provider, error } = getProvider();

  if (error) {
    throw new Error(`LLM configuration error: ${error}`);
  }

  switch (provider) {
    case 'stub':
      throw new Error('LLM is in stub mode — no real translation available');
    case 'bedrock':
      return bedrockCall(messages);
    case 'openai':
      return openaiCall(messages);
    case 'azure':
      return azureCall(messages);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

async function bedrockCall(messages: Message[]): Promise<string> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 8192,
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
  const textParts = result.content?.filter((c: any) => c.type === 'text') || [];
  return textParts.map((t: any) => t.text).join('');
}

async function openaiCall(messages: Message[]): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }

  const response = await fetch(`${OPENAI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: OPENAI_MODEL, messages, max_tokens: 8192 }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function azureCall(messages: Message[]): Promise<string> {
  const url = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, max_tokens: 8192 }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
