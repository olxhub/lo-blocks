'use client';
// packages/shared/lib/mcp/useMCP.ts
//
// useMCP — the generic CONSUME-side hook. Calls an MCP tool and tracks
// {data, loading, error}. Pairs with the ToolRegistry advertise side; specific
// hooks (useCatalog, a future useDocs) build on it. See docs/mcp-authoring.md.

import { useState, useEffect } from 'react';
import { callMcpTool } from './client';

export interface McpState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseMcpOptions<T> {
  /** Refetch key. Defaults to JSON.stringify(args) so a new object identity per
   *  render doesn't refetch. Pass a stable key for args that don't stringify
   *  cleanly (order-sensitive / non-JSON values). */
  argsKey?: string;
  /** Validate/shape the raw decoded result (e.g. a Zod schema's parse). Runtime
   *  validation the MCP text contract doesn't give us; throws → error state. */
  parse?: (raw: unknown) => T;
}

/**
 * Call an MCP tool, reloading when the args key changes.
 *
 * The in-flight request is cancelled on cleanup (AbortSignal) — not just ignored
 * — so StrictMode / quick arg changes / route changes don't leave duplicate
 * server-side work running. The stale-state guard remains as a belt-and-braces.
 *
 * TODO(push): when the tool advertises a list-changed notification, subscribe
 * (the transport already has the SSE stream) and refetch on it.
 */
export function useMCP<T>(
  tool: string,
  args: Record<string, unknown> = {},
  opts: UseMcpOptions<T> = {},
): McpState<T> {
  const { parse } = opts;
  const argsKey = opts.argsKey ?? JSON.stringify(args);
  const [state, setState] = useState<McpState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    callMcpTool<unknown>(tool, args, controller.signal)
      .then((raw) => {
        if (cancelled) return;
        setState({ data: parse ? parse(raw) : (raw as T), loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });

    return () => { cancelled = true; controller.abort(); };
    // args/parse are keyed via argsKey (stable); not by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, argsKey]);

  return state;
}
