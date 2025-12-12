// src/app/api/openai/[[...path]]/route.js

// Critical TODO: Add filtering, rate limiting, etc.

import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = "https://api.openai.com/v1/";

const USE_STUB = !OPENAI_API_KEY || process.env.LLM_MODE === 'STUB';

if (USE_STUB) {
  console.log('\n⚠️  LLM running in STUB mode - responses are fake.\n' +
    '   To use real OpenAI, set OPENAI_API_KEY and restart:\n' +
    '     export OPENAI_API_KEY=sk-...\n' +
    '   Or add it to .env.local\n');
}

export async function GET(request, { params }) {
  return proxyToOpenAI(request, params);
}
export async function POST(request, { params }) {
  return proxyToOpenAI(request, params);
}
export async function PUT(request, { params }) {
  return proxyToOpenAI(request, params);
}
export async function DELETE(request, { params }) {
  return proxyToOpenAI(request, params);
}

// Stub implementation for development/testing
async function stubOpenAI(request, path) {
  // Handle chat completions specifically
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
    message: 'Stub OpenAI API endpoint',
    path,
    method: request.method
  });
}

// Generic proxy handler for all methods
async function proxyToOpenAI(request, params) {
  const path = (await params).path ? (await params).path.join('/') : '';

  // Use stub if no API key is configured or in development
  if (USE_STUB) {
    console.log(`🤖 Using OpenAI stub for ${request.method} /${path}`);
    return stubOpenAI(request, path);
  }

  const url = `${OPENAI_BASE_URL}${path}${request.nextUrl.search}`;

  // Copy headers, replace Authorization
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${OPENAI_API_KEY}`);
  headers.set('Content-Type', 'application/json');

  // Remove headers that shouldn't be forwarded
  headers.delete('host');
  headers.delete('content-length');

  // Pass through body for methods that support it
  const body = ['POST', 'PUT', 'PATCH'].includes(request.method)
    ? await request.text()
    : undefined;

  // Fetch from OpenAI
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
