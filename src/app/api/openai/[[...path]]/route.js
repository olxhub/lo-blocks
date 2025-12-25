// src/app/api/openai/[[...path]]/route.js
//
// Proxy for chat completions. Client sends OpenAI format, server routes to configured provider.
//
// Providers (detected by env vars, in priority order):
//   Bedrock: AWS_BEDROCK_MODEL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
//            Use cross-region inference profile format: us.anthropic.claude-3-5-sonnet-20241022-v2:0
//            (The us. prefix is required for most models; without it you get inference profile errors)
//   Azure:   OPENAI_DEPLOYMENT_ID, OPENAI_BASE_URL, OPENAI_API_KEY
//   OpenAI:  OPENAI_API_KEY, OPENAI_MODEL (optional), OPENAI_BASE_URL (optional)
//   Stub:    No API key, or LLM_MODE=STUB

import { NextResponse } from 'next/server';

// Bedrock config
const AWS_BEDROCK_MODEL = process.env.AWS_BEDROCK_MODEL;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// OpenAI/Azure config
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const OPENAI_DEPLOYMENT_ID = process.env.OPENAI_DEPLOYMENT_ID;
const OPENAI_API_VERSION = process.env.OPENAI_API_VERSION || '2024-02-15';
const rawBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/";
const OPENAI_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl : rawBaseUrl + '/';

// Provider detection
const USE_BEDROCK = !!AWS_BEDROCK_MODEL;
const USE_AZURE = !USE_BEDROCK && !!OPENAI_DEPLOYMENT_ID;
const USE_STUB = !USE_BEDROCK && !OPENAI_API_KEY || process.env.LLM_MODE === 'STUB';

if (USE_STUB) {
  console.log('\n⚠️  LLM running in STUB mode - responses are fake.\n' +
    '   To use real LLM, set OPENAI_API_KEY or AWS_BEDROCK_MODEL and restart.\n');
}

export async function POST(request) {
  const body = await request.json();

  if (USE_STUB) {
    console.log(`🤖 Using LLM stub`);
    return stubResponse(body);
  }

  if (USE_BEDROCK) {
    return bedrockResponse(body);
  }

  return openaiResponse(body);
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

// --- OpenAI / Azure ---

async function openaiResponse(body) {
  const url = USE_AZURE
    ? `${OPENAI_BASE_URL}deployments/${OPENAI_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`
    : `${OPENAI_BASE_URL}chat/completions`;

  const headers = USE_AZURE
    ? { 'api-key': OPENAI_API_KEY, 'Content-Type': 'application/json' }
    : { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' };

  if (!USE_AZURE) {
    body.model = OPENAI_MODEL;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
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
