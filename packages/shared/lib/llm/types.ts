// packages/shared/lib/llm/types.ts
//
// Domain model for LLM chat. The conversation model (ChatMessage and its
// variants) and the tool / wire-format types live here, in the domain layer
// that owns them. The Redux store (lib/state/store), the LLM client
// (reduxClient), and the chat UI (components/common/ChatComponent) all import
// from this one definition so the union can never diverge into two copies.

import type { ReactNode } from 'react';

/* ──────────────────────────────────────────────────────────────────────────
 * Conversation model (displayed in the chat UI, persisted in Redux)
 * ────────────────────────────────────────────────────────────────────────── */

/** A file attached to a user message, stored so follow-up turns can replay it. */
export interface MessageAttachment {
  name: string;
  /** Content hash — stable id for dedupe / future upload-to-store. */
  hash: string;
  /** Full file content (text). Replaced with converted text once conversion lands. */
  body: string;
}

/** A chat line from a speaker (chatpeg Line, LLM response, user turn, etc.) */
export interface ChatLineMessage {
  type: 'Line';
  speaker: string;
  text: string;
  metadata?: Record<string, string>;
  attachments?: MessageAttachment[];
}

/** A system-level notification in the conversation. */
export interface SystemMessageEntry {
  type: 'SystemMessage';
  text: string;
}

/** A date divider between messages. */
export interface DateSeparatorEntry {
  type: 'DateSeparator';
  date: string;
}

/** An LLM tool call, surfaced in the transcript. */
export interface ToolCallEntry {
  type: 'ToolCall';
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/** A pre-rendered React element (embedded blocks, custom content). */
export interface ElementEntry {
  type: 'Element';
  element: ReactNode;
}

export type ChatMessage =
  | ChatLineMessage
  | SystemMessageEntry
  | DateSeparatorEntry
  | ToolCallEntry
  | ElementEntry;

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
