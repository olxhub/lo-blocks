// packages/shared/lib/mcp/registry.test.ts
//
// The ToolContext seam: identity threaded to handlers. callTool(name, args, ctx)
// and the per-session binding of toMcpTools(ctx) must both reach the handler's
// second parameter; toLLMTools carries no context (browser loop).

import { z } from 'zod';
import { createToolRegistry, type ToolContext } from './registry';

const In = z.object({ x: z.number() });

describe('ToolRegistry context', () => {
  test('callTool passes ctx through to the handler', async () => {
    const registry = createToolRegistry();
    let seen: ToolContext | undefined;
    registry.register('echo', { description: 'echo', input: In }, async (args, ctx) => {
      seen = ctx;
      return { x: args.x };
    });

    const ctx: ToolContext = { user: { user_id: 'alice', safe_user_id: 'nginx-alice' } };
    await registry.callTool('echo', { x: 1 }, ctx);
    expect(seen).toEqual(ctx);
  });

  test('callTool with no ctx leaves the second param undefined', async () => {
    const registry = createToolRegistry();
    let seen: ToolContext | undefined = { user: { user_id: 'sentinel' } };
    registry.register('echo', { description: 'echo', input: In }, async (args, ctx) => {
      seen = ctx;
      return { x: args.x };
    });
    await registry.callTool('echo', { x: 1 });
    expect(seen).toBeUndefined();
  });

  test('toMcpTools(ctx) binds the session context into every handler', async () => {
    const registry = createToolRegistry();
    let seen: ToolContext | undefined;
    registry.register('echo', { description: 'echo', input: In }, async (args, ctx) => {
      seen = ctx;
      return { x: args.x };
    });

    const ctx: ToolContext = { user: { user_id: 'bob', safe_user_id: 'guest-bob' } };
    const [tool] = registry.toMcpTools(ctx);
    await tool.handler({ x: 2 });
    expect(seen).toEqual(ctx);
  });

  test('toLLMTools handlers receive no context', async () => {
    const registry = createToolRegistry();
    let seen: ToolContext | undefined = { user: { user_id: 'sentinel' } };
    registry.register('echo', { description: 'echo', input: In }, async (args, ctx) => {
      seen = ctx;
      return { x: args.x };
    });
    const [tool] = registry.toLLMTools();
    await tool.callback({ x: 3 });
    expect(seen).toBeUndefined();
  });
});
