// src/app/api/openai/[[...path]]/route.js
//
// Proxy for chat completions. Client sends OpenAI format, server routes to configured provider.
//
// Provider selection (in order of precedence):
//   1. Explicit: LLM_PROVIDER=bedrock|azure|openai|stub
//   2. Inferred from env vars (fails if conflicting signals detected)
//
// Provider configs:
//   bedrock: AWS_BEDROCK_MODEL (use us. prefix), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
//   azure:   AZURE_API_KEY, AZURE_DEPLOYMENT_ID, AZURE_BASE_URL
//   openai:  OPENAI_API_KEY and/or OPENAI_BASE_URL, OPENAI_MODEL (optional)
//   stub:    LLM_PROVIDER=stub, or no provider config detected

import { NextResponse } from 'next/server';

// --- Config ---

// Bedrock
const AWS_BEDROCK_MODEL = process.env.AWS_BEDROCK_MODEL;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Azure (separate namespace to avoid conflicts)
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_DEPLOYMENT_ID = process.env.AZURE_DEPLOYMENT_ID;
const AZURE_API_VERSION = process.env.AZURE_API_VERSION || '2024-02-15';
const rawAzureUrl = process.env.AZURE_BASE_URL;
const AZURE_BASE_URL = rawAzureUrl
  ? (rawAzureUrl.endsWith('/') ? rawAzureUrl : rawAzureUrl + '/')
  : null;

// OpenAI (and compatible)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const rawOpenaiUrl = process.env.OPENAI_BASE_URL;
const OPENAI_BASE_URL = rawOpenaiUrl
  ? (rawOpenaiUrl.endsWith('/') ? rawOpenaiUrl : rawOpenaiUrl + '/')
  : 'https://api.openai.com/v1/';

// --- Provider Detection ---
function detectProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit) {
    if (!['bedrock', 'azure', 'openai', 'stub'].includes(explicit)) {
      throw new Error(`Invalid LLM_PROVIDER: ${explicit}. Must be bedrock, azure, openai, or stub.`);
    }
    return explicit;
  }

  // Infer from env vars
  const signals = {
    bedrock: !!AWS_BEDROCK_MODEL,
    azure: !!AZURE_DEPLOYMENT_ID,
    openai: !!(OPENAI_API_KEY || rawOpenaiUrl),  // API key OR custom base URL (e.g., Ollama)
  };

  const detected = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);

  if (detected.length > 1) {
    throw new Error(
      `Conflicting LLM provider settings detected: ${detected.join(', ')}. ` +
      `Set LLM_PROVIDER explicitly or remove conflicting env vars.`
    );
  }

  return detected[0] || 'stub';
}

let PROVIDER;
try {
  PROVIDER = detectProvider();
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
}

if (PROVIDER === 'stub') {
  console.log(`
⚠️  LLM running in STUB mode - responses are fake.

To configure a real LLM provider, set LLM_PROVIDER and required env vars:

  Bedrock (Claude):
    LLM_PROVIDER=bedrock
    AWS_BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
    AWS_ACCESS_KEY_ID=...
    AWS_SECRET_ACCESS_KEY=...
    AWS_REGION=us-east-1

  Azure OpenAI:
    LLM_PROVIDER=azure
    AZURE_API_KEY=...
    AZURE_DEPLOYMENT_ID=my-deployment
    AZURE_BASE_URL=https://myresource.openai.azure.com/openai/

  OpenAI (or compatible, e.g., Ollama):
    LLM_PROVIDER=openai
    OPENAI_API_KEY=sk-...              # optional for local servers
    OPENAI_BASE_URL=http://localhost:11434/v1/  # optional

See docs/llm-setup.md for details.
`);
}

export async function POST(request) {
  const body = await request.json();

  switch (PROVIDER) {
    case 'stub':
      console.log(`🤖 Using LLM stub`);
      return stubResponse(body);
    case 'bedrock':
      return bedrockResponse(body);
    case 'azure':
      return azureResponse(body);
    case 'openai':
      return openaiResponse(body);
  }
}

// --- Bedrock (Claude) ---

async function bedrockResponse(body) {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');

  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  // Transform OpenAI messages to Anthropic format
  const { system, messages } = transformToAnthropic(body.messages);

  const bedrockBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: body.max_tokens || 4096,
    messages,
    ...(system && { system }),
  };

  // Include tools if present
  if (body.tools?.length) {
    bedrockBody.tools = body.tools.map(t => ({
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

  // Transform Anthropic response to OpenAI format
  return NextResponse.json(transformToOpenAI(result));
}

// Transform OpenAI messages array to Anthropic format (separate system, messages)
function transformToAnthropic(messages) {
  let system = null;
  const transformed = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = system ? system + '\n' + msg.content : msg.content;
    } else if (msg.role === 'tool') {
      // Tool results in Anthropic format
      transformed.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        }],
      });
    } else if (msg.tool_calls) {
      // Assistant message with tool calls
      const content = [];
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

// Transform Anthropic response to OpenAI format
function transformToOpenAI(result) {
  const message = { role: 'assistant', content: null };

  // Extract text content
  const textParts = result.content?.filter(c => c.type === 'text') || [];
  if (textParts.length) {
    message.content = textParts.map(t => t.text).join('');
  }

  // Extract tool calls
  const toolUses = result.content?.filter(c => c.type === 'tool_use') || [];
  if (toolUses.length) {
    message.tool_calls = toolUses.map(tu => ({
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

// --- OpenAI (and compatible: Ollama, OpenRouter, etc.) ---

async function openaiResponse(body) {
  body.model = OPENAI_MODEL;

  const headers = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }

  const response = await fetch(`${OPENAI_BASE_URL}chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return new NextResponse(response.body, {
    status: response.status,
    // Pass through content-type for streaming support (text/event-stream)
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}

// --- Azure OpenAI ---

async function azureResponse(body) {
  const url = `${AZURE_BASE_URL}deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return new NextResponse(response.body, {
    status: response.status,
    // Pass through content-type for streaming support (text/event-stream)
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
  });
}

// --- Stub ---

function stubResponse(body) {
  const messages = body.messages || [];
  const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
  const preview = userMessage.substring(0, 150) + (userMessage.length > 150 ? '...' : '');

  let responseText;
  const lower = userMessage.toLowerCase();
  if (lower.includes('comedian')) {
    responseText = `[STUB COMEDIAN] "${preview}" → "Why did the student write this? Because they had something important to say... and I'm making it funny! 🎭"`;
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

  return NextResponse.json({
    id: 'stub-completion-id',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'stub',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: responseText },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  });
}
