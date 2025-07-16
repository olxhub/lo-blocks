// src/app/api/openai/[[...path]]/route.js

// Critical TODO: Add filtering, rate limiting, etc.

import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = "https://api.openai.com/v1/";

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

// Generic proxy handler for all methods
async function proxyToOpenAI(request, params) {
  const path = (await params).path ? (await params).path.join('/') : '';
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
