// src/lib/llm/openaiInterface.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function listChatCompletions(
  messages,
  { maxTokens = 128, temperature = 0.7 } = {}
) {

  const res = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages,
    max_tokens: maxTokens,
    temperature
  });

  const reply = res.choices?.[0]?.message?.content;

  return reply ?? "";
}
