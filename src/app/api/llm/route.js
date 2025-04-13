/*
  This is an API for calling LLMs.
*/

import { NextResponse, NextRequest } from 'next/server';
import * as openai from '../../lib/llm/azureInterface';
import * as stub from '../../lib/llm/stubInterface';

const listChatCompletions = openai.listChatCompletions;

const default_temperature = 100;
const default_tokens = 1000;

const default_prompt =     [
    { role: "system", content: "I am your writing coach. How can I help you?" },
    { role: "user", content: "Hi, how are you?"},
  ];
    
async function processPrompt(prompt, tokens, temperature) {
  const maxTokens = Number(tokens);
  return await listChatCompletions(
    prompt,
    {maxTokens: maxTokens}
  );
}

export async function GET(request) {
  const prompt = request.nextUrl.searchParams.get('prompt') || default_prompt;
  const tokens = request.nextUrl.searchParams.get('tokens') || default_tokens;
  const temperature = request.nextUrl.searchParams.get('temperature') || default_temperature;
  const jsonResponse = await processPrompt(prompt, tokens, temperature);
  return NextResponse.json({'response': jsonResponse});
}

// Handles POST requests
export async function POST(request) {
  const req = await request.json();

  const prompt = req?.prompt || default_prompt;
  const tokens = req?.tokens || default_tokens;
  const temperature = req?.temperature || default_temperature;

  const jsonResponse = await processPrompt(prompt, tokens, temperature);
  return NextResponse.json({'response': jsonResponse});
}
