// scripts/load-blocks.ts
//
// CLI front door for the `loadBlocks` MCP tool (docs/dynamic-blocks.md):
//
//   npm run load-blocks -- blocks-dynamic
//   npm run load-blocks -- /abs/path/to/blocks [http://localhost:8888]
//
// Speaks the MCP StreamableHTTP handshake (initialize → initialized →
// tools/call) so nobody has to hand-craft it with curl.

import path from 'node:path';

const [, , source, server = 'http://localhost:8888'] = process.argv;

if (!source) {
  console.error('Usage: npm run load-blocks -- <blocks-directory> [server-url]');
  process.exit(1);
}

const mcpUrl = `${server}/mcp`;
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  // The MCP StreamableHTTP transport requires accepting event-stream replies.
  Accept: 'application/json, text/event-stream',
};

/** POST one JSON-RPC message; parse the reply whether JSON or SSE-framed. */
async function rpc(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(mcpUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  const sessionId = res.headers.get('mcp-session-id');
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const text = await res.text();
  if (!text) return null; // notifications get empty replies
  // SSE frames look like "event: message\ndata: {...}"; plain JSON is JSON.
  const data = text.startsWith('event:') || text.startsWith('data:')
    ? text.split('\n').find((line) => line.startsWith('data:'))?.slice(5)
    : text;
  const message = JSON.parse(data ?? 'null');
  if (message?.error) {
    throw new Error(`Server replied: ${message.error.message}`);
  }
  return message;
}

async function main() {
  await rpc({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'load-blocks', version: '0' },
    },
  });
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const reply = await rpc({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'loadBlocks', arguments: { source: path.resolve(source) } },
  });

  // Tool results arrive as MCP content items; ours is one JSON text blob.
  const item = reply.result?.content?.find((c: any) => c.type === 'text');
  if (reply.result?.isError) {
    console.error(item?.text ?? 'loadBlocks failed with no message');
    process.exit(1);
  }
  const { version, loaded } = JSON.parse(item.text);
  console.log(`Registry version ${version}. Loaded ${loaded.length} block(s):`);
  for (const block of loaded) {
    console.log(block.error
      ? `  ✗ ${block.tag}  (${block.blueprintPath})\n    ${block.error}`
      : `  ✓ ${block.tag}  (${block.blueprintPath})`);
  }
  if (loaded.some((b: any) => b.error)) process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  console.error(`\nIs the dev server running at ${server}? Start it with: npm run dev`);
  process.exit(1);
});
