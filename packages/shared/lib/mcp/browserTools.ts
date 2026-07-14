'use client';
// packages/shared/lib/mcp/browserTools.ts
//
// Browser-side tool plane: ONE place a chat surface gets its LLM tools.
//
// Two kinds of tools live here:
//
//   - PASSTHROUGH tools, auto-discovered from the server's MCP tools/list.
//     The server owns schema, validation, and execution; the browser proxies
//     the call over /mcp. Any tool registered on the server registry becomes
//     available to in-browser LLM chats with no client code.
//
//   - CLIENT tools, registered by apps/blocks for operations that live in
//     browser state (e.g. Studio's edit-the-open-buffer, open-a-file). On a
//     name collision the client tool SHADOWS the passthrough one: the local
//     semantics are the surface's intent (Studio's `Edit` edits the unsaved
//     buffer, not the file on disk).
//
// Tools are grouped into named TOOLSETS; a chat surface asks for toolset
// names, not individual tools. `bind` fixes an argument server tools expect
// (e.g. `source` — the repo Studio is editing) without the LLM seeing it.
//
// This module is deliberately the seam between "tool runs in the browser"
// and "tool runs on the server": as UX state moves into synced fields, a
// client tool can become a server tool without chat surfaces changing.
//
// Two rules govern what belongs here (and in any ToolRegistry):
// - IDENTITY: the browser/LLM tool plane carries NO ToolContext — identity
//   lives server-side on the MCP session (registry.toMcpTools(ctx)); a
//   passthrough call is authenticated by the browser's cookie session.
// - CAPABILITY vs CONTROL: registries hold CAPABILITIES — reusable,
//   discoverable, potentially identity-bearing operations. Ephemeral,
//   interaction-scoped CONTROL tools (e.g. a chat interlude's
//   end_conversation, whose callback closes over per-send state and must
//   never leak across instances) are built at the call site and passed
//   directly in the tools array — registering one globally would be a bug,
//   and so would defining a real capability ad hoc.

import { z } from 'zod';
import { createToolRegistry, type ToolRegistry, type ToolDef, type LLMTool } from './registry';
import { callMcpTool, listMcpTools } from './client';
import type { LlmTool } from '../llm/types';

// =============================================================================
// Toolsets
// =============================================================================

/** Server-tool membership. Client tools declare theirs at registration. */
// list_files is deliberately absent: it serves the McpStorageProvider file
// tree, not LLM toolsets (agents use Glob). Server tools may be
// provider-facing without being chat-reachable.
const SERVER_TOOLSETS: Record<string, string[]> = {
  'content-read': ['Read', 'Glob', 'Grep', 'get_sources', 'Status'],
  'content-write': ['Write', 'Edit', 'Delete', 'Move', 'Status', 'Commit', 'Discard'],
  'docs': ['get_blocks', 'get_formats'],
  'catalog': ['get_repositories'],
};

/** toolset name → tool names (client registrations extend this). */
const toolsetMembers = new Map<string, Set<string>>(
  Object.entries(SERVER_TOOLSETS).map(([k, v]) => [k, new Set(v)]),
);

/** Which toolsets each CLIENT tool was registered under — shadowing a
 *  same-named server tool applies only when one of these is requested. */
const clientToolsets = new Map<string, Set<string>>();

function addToToolsets(toolName: string, toolsets: string[]): void {
  for (const ts of toolsets) {
    if (!toolsetMembers.has(ts)) toolsetMembers.set(ts, new Set());
    toolsetMembers.get(ts)!.add(toolName);
  }
  clientToolsets.set(toolName, new Set([...(clientToolsets.get(toolName) ?? []), ...toolsets]));
}

// =============================================================================
// Registries: passthrough (server) + client. Client shadows passthrough.
// =============================================================================

const passthroughRegistry = createToolRegistry();
const clientRegistry = createToolRegistry();

let discovered: Promise<void> | null = null;

/**
 * Discover the server's tools (once) and register passthroughs for them.
 * Local input validation is permissive — the server re-validates against
 * the real schema, which we carry as `jsonSchema` for the LLM wire format.
 *
 * `list` is injectable for tests; production always uses MCP tools/list.
 */
export function ensureServerTools(list: typeof listMcpTools = listMcpTools): Promise<void> {
  if (!discovered) {
    discovered = (async () => {
      const tools = await list();
      for (const t of tools) {
        if (passthroughRegistry.get(t.name)) continue;
        const readOnly = t.annotations?.readOnlyHint === true;
        passthroughRegistry.register(t.name, {
          description: t.description ?? t.name,
          input: z.record(z.unknown()),
          jsonSchema: t.inputSchema,
          annotations: t.annotations,
        }, async (args: Record<string, unknown>) =>
          // Retry only read-only tools: a write must not be replayed blind.
          callMcpTool(t.name, args, { retry: readOnly }));
      }
    })().catch((err) => {
      discovered = null;  // allow retry on next call
      throw err;
    });
  }
  return discovered;
}

/**
 * Register a client-side tool and the toolsets it belongs to.
 * Registering the same name again REPLACES the previous registration
 * (surfaces re-register as their context changes; last one wins).
 */
export function registerClientTool<TIn extends z.ZodType, TOut extends z.ZodType>(
  name: string,
  def: ToolDef<TIn, TOut>,
  handler: (args: z.infer<TIn>) => Promise<z.infer<TOut>>,
  toolsets: string[],
): void {
  clientRegistry.unregister(name);
  clientRegistry.register(name, def, handler);
  addToToolsets(name, toolsets);
}

// =============================================================================
// LLM tool assembly
// =============================================================================

export interface LlmToolsOptions {
  /** Arguments fixed by the surface and hidden from the LLM — stripped from
   *  each tool's schema (where present) and injected into every call.
   *  Example: `{ source: origin }` scopes content writes to Studio's repo. */
  bind?: Record<string, unknown>;
  /** Tool names to exclude (e.g. a surface that must never delete). */
  omit?: string[];
}

/** Strip bound keys from a JSON Schema's properties/required. */
function stripBoundKeys(schema: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const props = { ...(schema.properties as Record<string, unknown> | undefined) };
  let touched = false;
  for (const k of keys) {
    if (k in props) { delete props[k]; touched = true; }
  }
  if (!touched) return schema;
  const required = Array.isArray(schema.required)
    ? (schema.required as string[]).filter(r => !keys.includes(r))
    : undefined;
  return { ...schema, properties: props, ...(required ? { required } : {}) };
}

/**
 * The LLM tools for the given toolsets — passthrough + client merged, client
 * shadowing passthrough on name collisions. Call ensureServerTools() first
 * (or accept that only client tools are available until discovery lands).
 */
export function llmToolsFor(toolsets: string[], options: LlmToolsOptions = {}): LlmTool[] {
  const { bind = {}, omit = [] } = options;
  const bindKeys = Object.keys(bind);

  const wanted = new Set<string>();
  for (const ts of toolsets) {
    for (const name of toolsetMembers.get(ts) ?? []) wanted.add(name);
  }
  for (const name of omit) wanted.delete(name);

  // Client tools shadow same-named passthrough tools ONLY when the client
  // tool's own toolset was requested. Studio's buffer Edit (studio-editor)
  // must not hijack 'Edit' for a chat that asked only for content-write —
  // that chat wants the server LOFS Edit.
  const clientTools = new Map(clientRegistry.toLLMTools().map(t => [t.function.name, t]));
  const passthroughTools = new Map(passthroughRegistry.toLLMTools().map(t => [t.function.name, t]));
  const requested = new Set(toolsets);
  const clientRequested = (name: string): boolean =>
    [...(clientToolsets.get(name) ?? [])].some(ts => requested.has(ts));

  const result: LlmTool[] = [];
  for (const name of wanted) {
    const tool: LLMTool | undefined = (clientRequested(name) ? clientTools.get(name) : undefined)
      ?? passthroughTools.get(name);
    if (!tool) continue;  // toolset names a server tool the server doesn't serve
    result.push({
      function: {
        ...tool.function,
        parameters: stripBoundKeys(tool.function.parameters, bindKeys),
      },
      callback: bindKeys.length
        ? (args: Record<string, unknown>) => tool.callback({ ...args, ...bind })
        : tool.callback,
    });
  }
  return result;
}
