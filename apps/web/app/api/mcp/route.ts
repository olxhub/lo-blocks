// apps/web/app/api/mcp/route.ts
//
// MCP server endpoint.
//
// Accepts JSON-RPC 2.0 requests per the MCP protocol.
// Delegates to the framework-agnostic handler in packages/shared/lib/mcp/.
//
import { handleMcpRequest } from '@/lib/mcp/handler';

export async function POST(req: Request) {
  const body = await req.json();
  const result = await handleMcpRequest(body);

  // Notifications have no response
  if (result === null) {
    return new Response(null, { status: 204 });
  }

  return Response.json(result);
}
