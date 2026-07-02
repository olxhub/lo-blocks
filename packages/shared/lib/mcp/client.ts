'use client';
// packages/shared/lib/mcp/client.ts
//
// Browser-side MCP client — the CONSUME end of the protocol the ToolRegistry
// (registry.ts) ADVERTISES. One shared session over /mcp (StreamableHTTP),
// reused across calls. Tools encode their result as a JSON text block (see
// ToolRegistry.toMcpTools — always JSON), which we parse back into data.
//
// TODO(push): the StreamableHTTP transport already holds a GET /mcp SSE stream
// for server→client notifications. Wire a notification handler here for live
// updates — 2.0, or 1.0 if it stays simple.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let clientPromise: Promise<Client> | null = null;

/** Drop the cached client so the next call reconnects. Called when the session
 *  dies (server's 30-min TTL, or a restart) — otherwise a dead client would be
 *  reused forever and wedge the page until reload. */
function reset(): void {
  clientPromise = null;
}

function connect(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: 'lo-blocks-web', version: '0.1.0' });
      // Client.onclose/onerror fire when the underlying transport drops; clear
      // the singleton so we reconnect rather than reuse a closed session.
      client.onclose = reset;
      client.onerror = () => reset();
      const transport = new StreamableHTTPClientTransport(new URL('/mcp', window.location.origin));
      await client.connect(transport);
      return client;
    })().catch((err) => {
      reset();
      throw err;
    });
  }
  return clientPromise;
}

/** First text content block of a CallToolResult, or null. */
function textOf(res: { content?: Array<{ type: string; text?: string }> }): string | null {
  const block = (res.content ?? []).find((c) => c.type === 'text');
  return block?.text ?? null;
}

async function callOnce(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const client = await connect();
  const res = await client.callTool({ name, arguments: args }, undefined, signal ? { signal } : undefined);
  const text = textOf(res as { content?: Array<{ type: string; text?: string }> });
  if (res.isError) throw new Error(text || `MCP tool ${name} failed`);
  if (text === null) throw new Error(`MCP tool ${name} returned no text content`);
  return JSON.parse(text);
}

/**
 * Call an MCP tool and return its (JSON-decoded) result. Retries once after a
 * failure with a fresh connection, to recover transparently from an expired or
 * closed session. Safe because today's tools are read-only/idempotent — a future
 * non-idempotent tool (save_file) should opt out of the retry.
 */
export async function callMcpTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await callOnce(name, args, signal) as T;
  } catch (err) {
    if (signal?.aborted) throw err;
    reset();
    return await callOnce(name, args, signal) as T;
  }
}
