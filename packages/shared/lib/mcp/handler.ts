// packages/shared/lib/mcp/handler.ts
//
// Framework-agnostic MCP server handler.
//
// Implements the MCP protocol (JSON-RPC 2.0) as a pure function:
//   handleMcpRequest(body) → response
//
// Supports:
//   initialize       — protocol handshake + capabilities
//   tools/list       — enumerate available tools
//   tools/call       — dispatch to StorageProvider / ContentIndex
//   notifications/initialized — client ack (no response)
//
// Wire this to any HTTP framework:
//   Next.js:  Response.json(await handleMcpRequest(await req.json()))
//   Express:  res.json(await handleMcpRequest(req.body))
//   Hono:     c.json(await handleMcpRequest(await c.req.json()))
//   Raw Node: same pattern
//
import { getStorageManager } from '../lofs/storageManager';
import { getContentIndex } from '../content/contentIndex';
import { toContentNamespace } from '../types/storage';
import type { ContentNamespace } from '../types/storage';
import type { OlxRelativePath, OlxKey, ContentVariant } from '../types';

// =============================================================================
// JSON-RPC types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// =============================================================================
// Tool definitions
// =============================================================================

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

const TOOLS: ToolDef[] = [
  {
    name: 'lofs_read',
    description: 'Read a content file by path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path (e.g., "demos/hello.olx")' },
        namespace: { type: 'string', description: 'Content namespace (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lofs_write',
    description: 'Write content to a file (creates or updates)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'lofs_delete',
    description: 'Delete a content file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lofs_rename',
    description: 'Rename/move a content file',
    inputSchema: {
      type: 'object',
      properties: {
        oldPath: { type: 'string' },
        newPath: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['oldPath', 'newPath'],
    },
  },
  {
    name: 'lofs_glob',
    description: 'Find files matching a glob pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.olx")' },
        basePath: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'lofs_grep',
    description: 'Search file contents for a regex pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        include: { type: 'string', description: 'Glob to filter files' },
        limit: { type: 'number', description: 'Max results (default 100)' },
        namespace: { type: 'string' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'lofs_list',
    description: 'List all content files as a tree',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
      },
    },
  },
  {
    name: 'lofs_get_block',
    description: 'Get a parsed OlxJson block by ID (returns all variants)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Block ID (OlxKey)' },
        namespace: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'lofs_list_blocks',
    description: 'List all parsed blocks (returns block ID → tag summary)',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
      },
    },
  },
  {
    name: 'lofs_get_source',
    description: 'Find which file a block was parsed from',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        variant: { type: 'string', description: 'Content variant (default: "*")' },
        namespace: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'lofs_list_namespaces',
    description: 'List all configured content namespaces',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'lofs_sync',
    description: 'Sync content from storage (re-scan files, re-parse changed content)',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
      },
    },
  },
];

// =============================================================================
// Tool dispatch
// =============================================================================

function resolveNs(ns?: string): ContentNamespace | undefined {
  return ns ? toContentNamespace(ns) : undefined;
}

function getProvider(ns?: string) {
  const mgr = getStorageManager();
  return ns ? mgr.getProvider(toContentNamespace(ns)) : mgr.getDefaultProvider();
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'lofs_read': {
      const provider = getProvider(args.namespace);
      const result = await provider.read(args.path as OlxRelativePath);
      return textResult(result.content);
    }
    case 'lofs_write': {
      const provider = getProvider(args.namespace);
      await provider.write(args.path as OlxRelativePath, args.content);
      return textResult(`Written: ${args.path}`);
    }
    case 'lofs_delete': {
      const provider = getProvider(args.namespace);
      await provider.delete(args.path as OlxRelativePath);
      return textResult(`Deleted: ${args.path}`);
    }
    case 'lofs_rename': {
      const provider = getProvider(args.namespace);
      await provider.rename(args.oldPath as OlxRelativePath, args.newPath as OlxRelativePath);
      return textResult(`Renamed: ${args.oldPath} → ${args.newPath}`);
    }
    case 'lofs_glob': {
      const provider = getProvider(args.namespace);
      const matches = await provider.glob(args.pattern, args.basePath as OlxRelativePath | undefined);
      return textResult(matches.join('\n') || '(no matches)');
    }
    case 'lofs_grep': {
      const provider = getProvider(args.namespace);
      const matches = await provider.grep(args.pattern, {
        include: args.include,
        limit: args.limit ?? 100,
      });
      const text = matches.map(m => `${m.path}:${m.line}: ${m.content}`).join('\n') || '(no matches)';
      return textResult(text);
    }
    case 'lofs_list': {
      const provider = getProvider(args.namespace);
      const tree = await provider.listFiles();
      return textResult(JSON.stringify(tree, null, 2));
    }
    case 'lofs_get_block': {
      const idx = getContentIndex();
      await idx.sync(resolveNs(args.namespace));
      const block = idx.getBlock(args.id as OlxKey, resolveNs(args.namespace));
      if (!block) return textResult(`Block not found: ${args.id}`, true);
      return textResult(JSON.stringify(block, null, 2));
    }
    case 'lofs_list_blocks': {
      const idx = getContentIndex();
      const idMap = await idx.getIdMap(resolveNs(args.namespace));
      const summary: Record<string, string> = {};
      for (const [id, variantMap] of Object.entries(idMap)) {
        const firstVariant = Object.values(variantMap)[0] as { tag?: string } | undefined;
        summary[id] = firstVariant?.tag ?? '(unknown)';
      }
      return textResult(JSON.stringify(summary, null, 2));
    }
    case 'lofs_get_source': {
      const idx = getContentIndex();
      await idx.sync(resolveNs(args.namespace));
      const source = idx.getSourceFile(
        args.id as OlxKey,
        (args.variant ?? '*') as ContentVariant,
        resolveNs(args.namespace)
      );
      if (!source) return textResult(`Source not found for block: ${args.id}`, true);
      return textResult(source);
    }
    case 'lofs_list_namespaces': {
      const mgr = getStorageManager();
      const namespaces = mgr.listNamespaces();
      const defaultNs = mgr.defaultNamespace;
      return textResult(namespaces.map(ns => ns === defaultNs ? `${ns} (default)` : ns).join('\n'));
    }
    case 'lofs_sync': {
      const idx = getContentIndex();
      const { idMap, errors } = await idx.sync(resolveNs(args.namespace));
      const blockCount = Object.keys(idMap).length;
      let text = `Synced: ${blockCount} blocks`;
      if (errors.length > 0) {
        text += `, ${errors.length} errors:\n${errors.map(e => `  ${e.summary}: ${e.message}`).join('\n')}`;
      }
      return textResult(text);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// =============================================================================
// MCP protocol handler
// =============================================================================

const SERVER_INFO = {
  name: 'lo-blocks',
  version: '0.1.0',
};

const CAPABILITIES = {
  tools: {},
};

function jsonRpcOk(id: string | number | null, result: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/**
 * Handle a single MCP JSON-RPC request and return the response.
 *
 * Returns null for notifications (no response expected).
 */
export async function handleMcpRequest(body: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { id, method, params } = body;

  switch (method) {
    case 'initialize':
      return jsonRpcOk(id ?? null, {
        protocolVersion: '2024-11-05',
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
      });

    case 'notifications/initialized':
      // Client acknowledgement — no response
      return null;

    case 'tools/list':
      return jsonRpcOk(id ?? null, { tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};
      try {
        const result = await callTool(toolName, toolArgs);
        return jsonRpcOk(id ?? null, result);
      } catch (err: any) {
        return jsonRpcOk(id ?? null, textResult(err.message, true));
      }
    }

    case 'ping':
      return jsonRpcOk(id ?? null, {});

    default:
      return jsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
  }
}

/** List of tool definitions (for testing or introspection). */
export { TOOLS };
