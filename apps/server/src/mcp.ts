// apps/server/src/mcp.ts
//
// MCP server integration — wires the ToolRegistry to the official MCP SDK
// and serves tools over StreamableHTTP transport.
//
// The transport speaks MCP's JSON-RPC protocol:
//   POST /mcp   — client sends requests (tool calls, init, etc.)
//   GET  /mcp   — client opens SSE stream for server notifications
//   DELETE /mcp  — client terminates session
//
// Each session gets its own McpServer + Transport pair. Sessions are
// tracked in-memory (same model as WebSocket connections).

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ToolRegistry } from '@/lib/mcp/registry';

/** How long an idle session lives before being reaped (ms). */
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** How often we sweep for expired sessions (ms). */
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

// Active sessions: sessionId → session
const sessions = new Map<string, McpSession>();

// Periodic sweep for expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      console.log(`[MCP] Reaping idle session: ${sid}`);
      session.transport.close?.();
      session.server.close().catch(() => {});
      sessions.delete(sid);
    }
  }
}, SESSION_SWEEP_INTERVAL_MS);

/**
 * Create an McpServer instance with all tools from the registry registered.
 */
function createMcpServerWithTools(registry: ToolRegistry): McpServer {
  const server = new McpServer(
    { name: 'learning-opus', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  for (const tool of registry.toMcpTools()) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    }, async (args: any) => {
      return tool.handler(args);
    });
  }

  return server;
}

/**
 * Check if a JSON-RPC body is an initialize request.
 */
function isInitializeRequest(body: any): boolean {
  if (Array.isArray(body)) {
    return body.some(msg => msg.method === 'initialize');
  }
  return body?.method === 'initialize';
}

/**
 * Handle POST /mcp — JSON-RPC requests from clients.
 */
export async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  registry: ToolRegistry,
): Promise<void> {
  // Parse body — return JSON-RPC parse error (-32700) on malformed JSON
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    }));
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    // Existing session — route to its transport
    const session = sessions.get(sessionId)!;
    session.lastActivity = Date.now();
    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (!sessionId && isInitializeRequest(body)) {
    // New session — create server + transport
    const server = createMcpServerWithTools(registry);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, server, lastActivity: Date.now() });
        console.log(`[MCP] Session created: ${sid}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId && sessions.has(transport.sessionId)) {
        const session = sessions.get(transport.sessionId)!;
        sessions.delete(transport.sessionId);
        session.server.close().catch(() => {});
        console.log(`[MCP] Session closed: ${transport.sessionId}`);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  // Invalid request
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Bad request: missing or invalid session' },
    id: null,
  }));
}

/**
 * Handle GET /mcp — SSE stream for server-initiated notifications.
 */
export async function handleMcpGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid session ID' }));
    return;
  }
  const session = sessions.get(sessionId)!;
  session.lastActivity = Date.now();
  await session.transport.handleRequest(req, res);
}

/**
 * Handle DELETE /mcp — session termination.
 */
export async function handleMcpDelete(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }
  const session = sessions.get(sessionId)!;
  await session.transport.handleRequest(req, res);
}
