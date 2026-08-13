// Main client-side interface to the LLM.
//
// Uses Redux for persistent chat state that survives component unmount/remount.

'use client';

import { useCallback, useEffect } from 'react';
import { hashContent } from '@/lib/util/index';
import { useFieldState, updateField, appendToLog } from '@/lib/state';
import { chatFields, chatStateKey } from '@/lib/state/chatFields';
import type { ChatMessage, ChatLineMessage } from '@/lib/types';
import type { ApiMessage, LlmTool, ToolCall, ToolResult, ChatCompletionResponse } from './types';

const LLM_ENDPOINT = '/api/llm/chat/completions';

// In progress: State machine of LLM status
export const LLM_STATUS = {
  INIT: 'LLM_INIT',
  RUNNING: 'LLM_RUNNING',
  RESPONSE_READY: 'LLM_RESPONSE_READY',
  ERROR: 'LLM_ERROR',
  TOOL_RUNNING: 'LLM_TOOL_RUNNING',
};

// Execute tool calls sequentially and return canonical results.
// Tools run in order so each sees the effects of previous tools.
// Caller derives API and display formats as needed.
async function handleToolCalls(toolCalls: ToolCall[], tools: LlmTool[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const tool = findToolByName(tools, call.function.name);
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
    const result = tool ? await tool.callback(args) : '';

    // Single canonical format
    results.push({ id: call.id, name: call.function.name, args, result });
  }
  return results;
}

// Small helper to find tool in a list of tools
function findToolByName(tools: LlmTool[], name: string): LlmTool | undefined {
  return tools?.find(t => t.function.name === name);
}

/**
 * Turn a non-2xx response into a message that says what actually happened.
 *
 * The server explains every refusal in a JSON `error` field — "LLM token
 * budget exhausted.", "Rate limit exceeded. Try again later.", "Invalid JSON
 * in request body" — and a passthrough carries the provider's own
 * `{error: {message}}` instead. None of it used to reach the screen: a 429 has
 * no `choices`, so it fell through to the generic "No response from LLM" and
 * read as a broken integration rather than a quota someone can clear.
 *
 * Body is read as text first, then parsed. Response.json() consumes the
 * stream, so a parse failure would otherwise leave nothing to fall back on.
 */
async function describeHttpError(res: Response): Promise<string> {
  let raw = '';
  try { raw = await res.text(); } catch { /* body already consumed or empty */ }

  let detail = '';
  try {
    const body = JSON.parse(raw);
    const err = body?.error;
    detail = typeof err === 'string' ? err : (err?.message ?? '');
    if (!detail && typeof body?.message === 'string') detail = body.message;
    if (detail && body?.details) detail += ` (${JSON.stringify(body.details).slice(0, 200)})`;
  } catch {
    detail = raw.trim().slice(0, 200);
  }

  // 429 carries Retry-After; a wait the user can act on beats a bare code.
  const retry = res.headers.get('retry-after');
  const suffix = retry ? ` Try again in ${retry}s.` : '';

  return detail
    ? `LLM error (${res.status}): ${detail}${suffix}`
    : `LLM error: HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}.${suffix}`;
}

// Core LLM call logic, standalone async function.
//
// TODO: Do we want to replace this with a standard library?
// TODO: Add a 'profile' parameter that selects server-side presets
//       (model, system prompt, rate limits, etc.)
export interface CallLLMParams {
  history?: ApiMessage[];
  prompt?: string;
  tools?: LlmTool[];
  statusCallback?: (status: string) => void;
  /**
   * OpenAI-shaped `response_format`, forwarded to the provider untouched.
   *
   * Support is NOT uniform. The openai and azure paths in proxy.ts serialize
   * the request body straight through, so a `json_schema` format reaches the
   * provider and is enforced. The bedrock path builds its own Anthropic body
   * and drops anything it does not map, and the stub provider always answers
   * with prose. Callers must treat structured output as best-effort and keep a
   * text fallback — see callLLMJson.
   */
  responseFormat?: Record<string, unknown>;
  /**
   * The launchable activity this call belongs to, for quota accounting.
   *
   * Budgets are charged per user PER ACTIVITY, and only the caller knows which
   * one it is in — the server sees a bare completions request. Omitted calls
   * fall back to the shared per-user budget, so a caller that does not pass it
   * still works and still counts.
   */
  activityId?: string;
}

export interface CallLLMResult {
  messages: ChatMessage[];
  error: boolean;
}

export async function callLLM(params: CallLLMParams): Promise<CallLLMResult> {
  const {
    history,
    prompt,
    tools = [],
    statusCallback = () => null,
    responseFormat,
    activityId,
  } = params;

  // Validation: exactly one of prompt or history must be provided
  if ((!prompt && !history) || (prompt && history)) {
    throw new Error('Must provide exactly one of: prompt or history');
  }

  // Convert prompt to history if needed
  const messages: ApiMessage[] = history ?? [{ role: 'user', content: prompt ?? '' }];

  let loopCount = 0;
  let newMessages: ApiMessage[] = [];
  let displayMessagesAccum: ChatMessage[] = [];  // Tool calls to show in chat
  while (loopCount++ < 10) {
    try {
      const res = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, ...newMessages],
          // OpenAI wire format requires type on every tool — providers that
          // pass the body through untransformed (azure/openai) 400 without it.
          tools: tools ? tools.map(({ callback, ...rest }) => ({ type: 'function', ...rest })) : [],
          ...(responseFormat && { response_format: responseFormat }),
          ...(activityId && { activity: activityId }),
        }),
      });
      // Check the status before reading the body as a completion. A refusal
      // (429 budget/rate limit, 400 bad request, provider error) carries no
      // `choices`, so parsing it as one loses the reason it was refused.
      if (!res.ok) {
        statusCallback(LLM_STATUS.ERROR);
        return {
          messages: [...displayMessagesAccum, { type: 'SystemMessage', text: await describeHttpError(res) }],
          error: true,
        };
      }

      const json = ((await res.json()) as ChatCompletionResponse).choices?.[0];
      const content = json?.message?.content;
      const toolCalls = json?.message?.tool_calls;

      // Handle tool calls if present
      if (toolCalls?.length) {
        statusCallback(LLM_STATUS.TOOL_RUNNING);
        const toolResults = await handleToolCalls(toolCalls, tools);

        // Add to API history (for next request)
        newMessages = [
          ...newMessages,
          json.message,
          ...toolResults.map(r => ({ role: 'tool' as const, content: r.result, tool_call_id: r.id }))
        ];

        // Add to display messages
        displayMessagesAccum = [
          ...displayMessagesAccum,
          ...toolResults.map(r => ({ type: 'ToolCall' as const, name: r.name, args: r.args, result: r.result }))
        ];

        // If there's also content, return it (some models send both)
        if (content) {
          statusCallback(LLM_STATUS.RESPONSE_READY);
          return {
            messages: [...displayMessagesAccum, { type: 'Line', speaker: 'LLM', text: content }],
            error: false,
          };
        }
        continue;
      }

      // No tool calls - check for content
      if (content) {
        statusCallback(LLM_STATUS.RESPONSE_READY);
        return {
          messages: [...displayMessagesAccum, { type: 'Line', speaker: 'LLM', text: content }],
          error: false,
        };
      } else {
        statusCallback(LLM_STATUS.ERROR);
        return {
          messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'No response from LLM' }],
          error: true,
        };
      }
    } catch (err) {
      statusCallback(LLM_STATUS.ERROR);
      return {
        messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'Error contacting LLM' }],
        error: true,
      };
    }
  }
  // If loop exceeds
  statusCallback(LLM_STATUS.ERROR);
  return {
    messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'Too many tool calls without a final response. Try asking again.' }],
    error: true,
  };
}

// Most common interface to LLM.
//
// Chat state is persisted in Redux, keyed by chatId. This allows chat history
// to survive component unmount/remount (e.g., when switching sidebar tabs).
//
// @param {object} params
// @param {string} params.chatId - Unique ID for this chat (default: 'default')
// @param {array} params.tools - Default tool definitions (can be overridden per-call)
// @param {string} params.systemPrompt - Default system prompt (can be overridden per-call)
// @param {string} params.initialMessage - Initial message to show (default: 'Ask the LLM a question.')
export interface UseChatParams {
  chatId?: string;
  tools?: LlmTool[];
  systemPrompt?: string;
  initialMessage?: string;
}

/** A file picked in the UI before it's hashed and stored as a MessageAttachment. */
export interface AttachmentInput {
  name: string;
  content: string;
}

export interface SendMessageOptions {
  attachments?: AttachmentInput[];
  tools?: LlmTool[];
  systemPrompt?: string;
}

export function useChat(params: UseChatParams = {}) {
  const {
    chatId = 'default',
    tools: defaultTools = [],
    systemPrompt: defaultSystemPrompt,
    initialMessage = 'Ask the LLM a question.'
  } = params;

  // Chat state is ordinary field data (chatFields.ts): the transcript is an
  // append-only log CRDT, status a LWW register, keyed per conversation.
  // props = null + explicit stateKey — the non-block-surface field pattern.
  const stateKey = chatStateKey(chatId);
  const [messages] = useFieldState(null, chatFields.messages, [] as ChatMessage[], { stateKey }) as [ChatMessage[], unknown];
  const [status] = useFieldState(null, chatFields.status, LLM_STATUS.INIT, { stateKey }) as [string, unknown];

  // Dispatch helpers
  const addMessage = useCallback((message: ChatMessage) => {
    appendToLog(null, chatFields.messages, message, { stateKey });
  }, [stateKey]);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    for (const message of msgs) appendToLog(null, chatFields.messages, message, { stateKey });
  }, [stateKey]);

  const setStatus = useCallback((newStatus: string) => {
    updateField(null, chatFields.status, newStatus, { stateKey });
  }, [stateKey]);

  // Initialize with initial message if chat is empty
  useEffect(() => {
    if (messages.length === 0) {
      addMessage({ type: 'SystemMessage', text: initialMessage });
    }
  }, [chatId, messages.length, initialMessage, addMessage]);

  // sendMessage accepts per-call overrides for tools and systemPrompt
  // This allows building fresh tools with current values at call time
  const sendMessage = useCallback(async (text: string, options: SendMessageOptions = {}) => {
    const {
      attachments = [],
      tools = defaultTools,
      systemPrompt = defaultSystemPrompt,
    } = options;

    setStatus(LLM_STATUS.RUNNING);

    // Process attachments: add hash, prepare for storage/API/display
    // TODO: convertToText(attachment.content) once conversion abstraction is implemented
    //       (e.g., pptx2text, pdf2text). For now, assume content is already text.
    //       Then: uploadToS3orSimilarStore({ key: hash, text: convertedText, name, body, timestamp })
    const processedAttachments = await Promise.all(attachments.map(async a => ({
      name: a.name,
      hash: await hashContent(a.content),
      body: a.content,  // To be replaced with convertedText once conversion is implemented
    })));

    // Build display text (what user sees in chat - strip body)
    const attachmentSuffix = processedAttachments.length > 0
      ? '\n\n' + processedAttachments.map(a => `📎 ${a.name}`).join('\n')
      : '';
    const displayText = (text || '') + attachmentSuffix;

    // Build API text for LLM (what LLM sees - full file content)
    const attachmentContent = processedAttachments.length > 0
      ? '\n\n' + processedAttachments.map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``).join('\n\n')
      : '';
    const apiText = (text || '') + attachmentContent;

    // Store message with attachments so they persist across follow-ups
    // User messages store: { name, hash, body } for full replicability
    // This allows follow-up questions to reference the same files
    const userMessage: ChatLineMessage = {
      type: 'Line',
      speaker: 'You',
      text: displayText,
      attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
    };
    addMessage(userMessage);

    // Build history from messages (reconstructing apiText for LLM context)
    // This ensures follow-up questions include full file content in history
    // Note: messages here is the snapshot at time of call
    const lineMessages = [
      ...messages,
      { type: 'Line', speaker: 'You', text: apiText } as ChatLineMessage,
    ].filter((msg): msg is ChatLineMessage => msg.type === 'Line');
    let history: ApiMessage[] = lineMessages.map((msg) => {
      // Reconstruct apiText for user messages with attachments
      let content = msg.text;
      if (msg.attachments && msg.attachments.length > 0) {
        const attachmentContent = msg.attachments
          .map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``)
          .join('\n\n');
        content = msg.text.replace(/\n\n📎[\s\S]*$/, '') + '\n\n' + attachmentContent;
      }
      return {
        role: msg.speaker === 'You' ? 'user' : 'assistant',
        content,
      };
    });

    // Prepend system prompt if provided
    if (systemPrompt) {
      history = [{ role: 'system', content: systemPrompt }, ...history];
    }

    const { messages: newMessages, error } = await callLLM({
      history,
      tools,
      statusCallback: setStatus,
    });

    addMessages(newMessages);
    if (error) setStatus(LLM_STATUS.ERROR);
    // Otherwise, statusCallback inside callLLM handles success
  }, [messages, defaultTools, defaultSystemPrompt, addMessage, addMessages, setStatus]);

  return { messages, sendMessage, status };
}

// Simple wrapper that returns just the text content
export async function callLLMSimple(prompt: string, activityId?: string): Promise<string> {
  const { messages, error } = await callLLM({
    prompt,
    statusCallback: () => {}, // No status needed for simple calls
  });

  if (error) {
    const first = messages[0];
    const detail = first && 'text' in first ? first.text : undefined;
    throw new Error(detail || 'LLM call failed');
  }

  // Extract just the text content
  return messages.find(
    (m): m is ChatLineMessage => m.type === 'Line' && m.speaker === 'LLM'
  )?.text || 'No response';
}

/**
 * Parse a JSON object out of model output, tolerating a code fence or
 * surrounding prose. Returns null rather than throwing: a provider that
 * ignored `response_format` answers with ordinary text, and that is a
 * fallback case, not an error.
 */
function parseJsonObject(text: string): Record<string, unknown> | null {
  let body = (text ?? '').trim();
  if (!body) return null;
  if (body.startsWith('```')) {
    body = body.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
  }
  const attempts = [body];
  const braced = body.match(/\{[\s\S]*\}/);
  if (braced) attempts.push(braced[0]);
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Constrain the model to a JSON Schema and return the parsed object.
 *
 * Returns `{data: null, text}` — it does not throw — when the answer cannot be
 * read as an object, because provider support is uneven (see
 * CallLLMParams.responseFormat). The caller is expected to fall back to `text`,
 * so a deployment on bedrock or the stub provider degrades to ordinary prose
 * feedback instead of failing.
 *
 * `strict: true` is what makes a schema's required properties non-optional at
 * generation time, which is the whole point of using one: a checklist the model
 * must fill cannot be quietly skipped the way a checklist in prose can.
 */
export async function callLLMJson(
  prompt: string,
  schema: Record<string, unknown>,
  schemaName: string = 'result',
  activityId?: string,
): Promise<{ data: Record<string, unknown> | null; text: string }> {
  const { messages, error } = await callLLM({
    prompt,
    activityId,
    statusCallback: () => {},
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema },
    },
  });

  if (error) {
    const first = messages[0];
    const detail = first && 'text' in first ? first.text : undefined;
    throw new Error(detail || 'LLM call failed');
  }

  const text = messages.find(
    (m): m is ChatLineMessage => m.type === 'Line' && m.speaker === 'LLM'
  )?.text || '';

  return { data: parseJsonObject(text), text };
}
