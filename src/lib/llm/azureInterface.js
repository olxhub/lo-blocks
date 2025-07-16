// src/lib/llm/azureInterface.js

// OBSOLETE / DEPRECATED.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function listChatCompletions(
  messages,
  {
    maxTokens = 128,
    tools,
    tool_choice
  } = {}
) {

  const res = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
    max_tokens: maxTokens,
    ...(tools && { tools }),
    ...(tool_choice && { tool_choice }),
  });

  const reply = res.choices?.[0]?.message;

  return reply ?? "";
}
