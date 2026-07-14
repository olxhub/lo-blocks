// packages/shared/lib/mcp/registry.ts
//
// Tool registry — define tools once, serve them over MCP, Claude API
// tool_use, Hono REST endpoints, or direct in-process calls.
//
// Zod schemas are the single source of truth for input/output validation.
// The registry converts them to JSON Schema for wire formats (MCP, OpenAPI,
// Claude tool_use) automatically.
//
// Usage:
//   const registry = new ToolRegistry();
//   registry.register('read', { ... }, handler);
//   registry.toLLMTools();      // For callLLM()
//   registry.toMcpTools();      // For McpServer
//   registry.callTool('read', { path: 'foo.olx' });  // Direct

import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from './zodToJsonSchema';

export type { ToolAnnotations };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extensible metadata bag for future formats (OpenAPI, etc.) */
export type ToolMeta = Record<string, unknown>;

/**
 * Per-call context threaded to handlers (identity today; room to grow).
 *
 * Structurally typed on purpose: the registry is shared/browser-safe and must
 * NOT import the server's auth module. The server binds a context shaped from
 * its AuthUser (user_id + safe_user_id) when it registers tools on a session
 * (see toMcpTools(ctx) / callTool(name, args, ctx)). Handlers that don't care
 * about identity (read-side tools) simply ignore it.
 */
export interface ToolContext {
  user?: {
    user_id: string;
    safe_user_id?: string;
    email?: string;
  };
}

/** Tool definition: schema + description + optional metadata. */
export interface ToolDef<
  TIn extends z.ZodType = z.ZodType,
  TOut extends z.ZodType = z.ZodType,
> {
  description: string;
  input: TIn;
  output?: TOut;
  annotations?: ToolAnnotations;
  meta?: ToolMeta;
  /**
   * Pre-built JSON Schema for the input, used instead of converting `input`.
   * For PASSTHROUGH tools (a client-side registry proxying a remote MCP
   * server): the remote server owns the real schema and validation; the
   * local `input` is then typically permissive (the remote re-validates).
   */
  jsonSchema?: Record<string, unknown>;
}

/** A registered tool: definition + handler. */
export interface RegisteredTool<
  TIn extends z.ZodType = z.ZodType,
  TOut extends z.ZodType = z.ZodType,
> {
  name: string;
  def: ToolDef<TIn, TOut>;
  handler: (args: z.infer<TIn>, ctx?: ToolContext) => Promise<z.infer<TOut>>;
}

/**
 * LLM tool descriptor — OpenAI-compatible format used by callLLM() /
 * handleToolCalls() in reduxClient.jsx.  The { type: 'function', function }
 * shape is OpenAI's tool format; we use it because callLLM() posts to an
 * OpenAI-compatible endpoint.
 */
// TODO(type-unification): near-duplicate of LlmTool in lib/llm/types.ts
// (differs only in the `type: 'function'` literal and sync-vs-async callback;
// the names differ only by case). Unify on the wire-consumed shape in
// llm/types.ts and derive this one — flagged by the 2026-07 coherence audit.
export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
  callback: (args: any) => Promise<string>;
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  /**
   * Register a tool with its schema and handler.
   *
   * Input is validated against the Zod schema before the handler runs.
   * If validation fails, the handler is not called and the error is returned.
   */
  register<TIn extends z.ZodType, TOut extends z.ZodType>(
    name: string,
    def: ToolDef<TIn, TOut>,
    handler: (args: z.infer<TIn>, ctx?: ToolContext) => Promise<z.infer<TOut>>,
  ): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    this.tools.set(name, { name, def, handler });
  }

  /** Get a registered tool by name. */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /** Remove a tool. No-op when absent. Lets a surface re-register a tool as
   *  its context changes (register throws on duplicates by design). */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /** All registered tool names. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Call a tool directly (in-process). Validates input, runs handler.
   */
  async callTool<T = unknown>(name: string, args: unknown, ctx?: ToolContext): Promise<T> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.def.input.parse(args);
    return tool.handler(parsed, ctx);
  }

  // -------------------------------------------------------------------------
  // Export: OpenAI-compatible tool format (for callLLM)
  // -------------------------------------------------------------------------

  /**
   * Export tools in the format expected by callLLM() / handleToolCalls().
   *
   * Each tool's handler is wrapped to:
   *   1. Validate input via Zod
   *   2. Call the original handler
   *   3. Return a string result (JSON-stringified if not already a string)
   *
   * This matches the { type, function, callback } shape from createEditorTools().
   *
   * Errors are caught and returned as "Error: ..." strings because callLLM()
   * expects callbacks to always resolve (never reject). Compare toMcpTools()
   * which lets errors propagate — the MCP SDK converts thrown errors into
   * JSON-RPC error responses at the transport level.
   *
   * TODO: Unify error handling once callLLM() can handle rejections.
   */
  toLLMTools(): LLMTool[] {
    return [...this.tools.values()].map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.def.description,
        parameters: tool.def.jsonSchema ?? zodToJsonSchema(tool.def.input),
      },
      callback: async (args: any): Promise<string> => {
        try {
          const parsed = tool.def.input.parse(args);
          const result = await tool.handler(parsed);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
      },
    }));
  }

  // -------------------------------------------------------------------------
  // Export: MCP tool descriptors
  // -------------------------------------------------------------------------

  /**
   * Returns tool descriptors for MCP SDK's McpServer.registerTool().
   *
   * inputSchema is the raw Zod schema — the SDK converts it to JSON Schema
   * internally and validates input before calling the handler.
   *
   * `ctx` binds a per-session context (identity) into every handler. The
   * server calls toMcpTools(ctx) once per MCP session, when it registers the
   * tools on that session's McpServer, so each session's writes are attributed
   * to the session's authenticated user.
   */
  toMcpTools(ctx?: ToolContext): Array<{
    name: string;
    description: string;
    inputSchema: z.ZodType;
    annotations?: ToolAnnotations;
    handler: (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  }> {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.def.description,
      inputSchema: tool.def.input,
      annotations: tool.def.annotations,
      handler: async (args: any) => {
        // SDK already validates via the Zod schema, so args are parsed.
        const result = await tool.handler(args, ctx);
        // Always JSON — including string results. The text block is the wire
        // contract the client JSON.parses back (callMcpTool); leaving a string
        // raw would make a plain-text tool's output un-parseable. (The richer
        // path is outputSchema + structuredContent, which also validates
        // server-side — a later MCP-hardening step.)
        const text = JSON.stringify(result, null, 2);
        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    }));
  }
}

/**
 * Create a new ToolRegistry instance.
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
