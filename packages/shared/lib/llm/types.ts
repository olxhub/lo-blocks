// packages/shared/lib/llm/types.ts
//
// LLM-specific types: tool definitions, wire format, and API types.
//
// The conversation model (ChatMessage and its variants) lives in
// types/core.ts — it's shared across chat surfaces (LLM, chatpeg,
// collaboration). This file has only the LLM implementation types:
// tool callbacks, OpenAI wire format, completion responses.

// Conversation types (ChatMessage, ChatLineMessage, etc.) live in
// types/core.ts — import from @/lib/types, not here.

/* ──────────────────────────────────────────────────────────────────────────
 * Tools
 * ────────────────────────────────────────────────────────────────────────── */

/** An OpenAI-style function tool plus the client-side callback that runs it.
 *  Only the `function` half crosses the wire — `callback` is stripped before
 *  the definition is sent to the server (see callLLM). */
export interface LlmTool {
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
  callback: (args: Record<string, unknown>) => string | Promise<string>;
}

/** A tool invocation requested by the model (OpenAI shape). */
export interface ToolCall {
  id: string;
  function: {
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
  };
}

/** The canonical result of executing one ToolCall. */
export interface ToolResult {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Wire format (OpenAI chat-completions, as proxied by /api/llm)
 * ────────────────────────────────────────────────────────────────────────── */

/** A role/content message as sent to and returned by the completions API. */
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: ApiMessage;
    finish_reason?: string;
  }>;
}
