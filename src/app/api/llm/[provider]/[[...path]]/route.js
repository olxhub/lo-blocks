// src/app/api/llm/[provider]/[[...path]]/route.js

// Critical TODO: Add filtering, rate limiting, etc.
// Generic LLM proxy route supporting multiple providers.

import { NextResponse } from 'next/server';

const PROVIDER_CONFIGS = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/',
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    name: 'OpenAI',
  },
  azure: {
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseUrl: process.env.AZURE_OPENAI_BASE_URL,
    buildHeaders: (apiKey) => ({ 'api-key': apiKey }),
    name: 'Azure OpenAI',
  },
};

const isStubMode = process.env.LLM_MODE === 'STUB';

function normalizeProvider(provider) {
  return provider?.toLowerCase();
}

function getProviderConfig(provider) {
  const normalized = normalizeProvider(provider);
  return normalized ? PROVIDER_CONFIGS[normalized] : undefined;
}

function ensureTrailingSlash(url) {
  if (!url) return url;
  return url.endsWith('/') ? url : `${url}/`;
}

export async function GET(request, { params }) {
  return proxyToProvider(request, params);
}

export async function POST(request, { params }) {
  return proxyToProvider(request, params);
}

export async function PUT(request, { params }) {
  return proxyToProvider(request, params);
}

export async function DELETE(request, { params }) {
  return proxyToProvider(request, params);
}

// Stub implementation for development/testing
async function stubLLM(request, path, providerName = 'Unknown provider') {
  if (path === 'chat/completions' && request.method === 'POST') {
    const body = await request.json();
    const messages = body.messages || [];
    const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';

    // Extract student text from the prompt (look for text after common prompt patterns)
    const studentTextMatch = userMessage.match(/(?:rewrite this|text:|content:)\s*(.+)$/i);
    const studentText = studentTextMatch ? studentTextMatch[1].trim() : userMessage;
    const preview = studentText.substring(0, 150) + (studentText.length > 150 ? '...' : '');

    // Generate response that mirrors student content with style-specific transformation
    let responseText;
    if (userMessage.toLowerCase().includes('comedian')) {
      responseText = `[STUB COMEDIAN] Here's your text with comedic flair: "${preview}" → "Why did the student write this? Because they had something important to say... and I'm making it funny! 🎭" (Stub response showing student input was received)`;
    } else if (userMessage.toLowerCase().includes('first grader')) {
      responseText = `[STUB FIRST GRADER] Making it simple: "${preview}" → "This is easy words for little kids to read!" (Stub showing your text: ${preview})`;
    } else if (userMessage.toLowerCase().includes('business')) {
      responseText = `[STUB BUSINESS] Professional version: "${preview}" → "We are pleased to leverage synergistic solutions..." (Stub echoing: ${preview})`;
    } else if (userMessage.toLowerCase().includes('legal')) {
      responseText = `[STUB LEGAL] Legal format: "${preview}" → "Whereas the aforementioned content, hereinafter referred to as..." (Stub processing: ${preview})`;
    } else if (userMessage.toLowerCase().includes('academic')) {
      responseText = `[STUB ACADEMIC] Academic style: "${preview}" → "The hermeneutical implications of the aforementioned discourse..." (Stub received: ${preview})`;
    } else {
      responseText = `[STUB] Processed your text: "${preview}" → [This would be the transformed version] (Echo verification: student input received correctly)`;
    }

    return NextResponse.json({
      id: 'stub-completion-id',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'gpt-3.5-turbo',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseText
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });
  }

  // Generic stub response for other endpoints
  return NextResponse.json({
    message: 'Stub LLM API endpoint',
    provider: providerName,
    path,
    method: request.method
  });
}

// Generic proxy handler for all methods
async function proxyToProvider(request, params) {
  const provider = normalizeProvider((await params).provider);
  const path = (await params).path ? (await params).path.join('/') : '';

  const config = getProviderConfig(provider);

  const missingConfig = !config || !config.apiKey || !config.baseUrl;
  const useStub = isStubMode || missingConfig;

  if (useStub) {
    const reason = isStubMode
      ? 'LLM_MODE set to STUB'
      : `Missing configuration for provider: ${provider || 'unknown'}`;
    console.log(`\n⚠️  LLM running in STUB mode (${reason}).\n` +
      `   Requested provider: ${config?.name || provider || 'unknown'}\n` +
      `   To use a real provider, ensure API keys and URLs are configured.\n`);
    return stubLLM(request, path, config?.name || provider || 'unknown');
  }

  const url = `${ensureTrailingSlash(config.baseUrl)}${path}${request.nextUrl.search}`;

  // Copy headers, replace Authorization
  const headers = new Headers(request.headers);
  const providerHeaders = config.buildHeaders(config.apiKey) || {};
  Object.entries(providerHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set('Content-Type', 'application/json');

  // Remove headers that shouldn't be forwarded
  headers.delete('host');
  headers.delete('content-length');

  // Pass through body for methods that support it
  const body = ['POST', 'PUT', 'PATCH'].includes(request.method)
    ? await request.text()
    : undefined;

  const response = await fetch(url, {
    method: request.method,
    headers,
    body,
    duplex: 'half', // Needed for edge runtime streaming; safe to include
  });

  // Pass through status and headers
  const res = new NextResponse(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      // Add any other headers as needed
    },
  });
  return res;
}
