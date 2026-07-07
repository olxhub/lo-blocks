// packages/shared/lib/mcp/browserTools.test.ts
//
// The browser tool plane's assembly rules: toolset selection, client tools
// shadowing passthrough tools, and `bind` hiding fixed args from the LLM.
// Server discovery is injected (no MCP connection); passthrough execution
// (callMcpTool) is exercised by the server e2e checks, not here.

import { z } from 'zod';
import { ensureServerTools, registerClientTool, llmToolsFor } from './browserTools';
import type { McpToolInfo } from './client';

const SERVER_TOOLS: McpToolInfo[] = [
  {
    name: 'Read',
    description: 'server read',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, source: { type: 'string' } },
      required: ['path'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'Write',
    description: 'server write',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' }, source: { type: 'string' } },
      required: ['path', 'content', 'source'],
    },
  },
  {
    name: 'Edit',
    description: 'server edit',
    inputSchema: { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] },
  },
  {
    name: 'get_blocks',
    description: 'block docs',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
];

beforeAll(async () => {
  await ensureServerTools(async () => SERVER_TOOLS);
});

describe('browser tool plane', () => {
  test('toolsets select server tools; unknown names are skipped quietly', () => {
    const tools = llmToolsFor(['content-read', 'docs']);
    const names = tools.map(t => t.function.name).sort();
    // Glob/Grep/get_sources/get_formats are in the toolsets but not served
    // by this (fake) server — present servers add them with no client change.
    expect(names).toEqual(['Read', 'get_blocks']);
  });

  test('client tool shadows a same-named server tool', async () => {
    registerClientTool('Edit', {
      description: 'buffer edit',
      input: z.object({ old_string: z.string() }),
      output: z.string(),
    }, async () => 'buffer-edited', ['studio-editor']);

    // 'Edit' is in both content-write (server) and studio-editor (client):
    // the client definition wins.
    const tools = llmToolsFor(['content-write', 'studio-editor']);
    const edit = tools.find(t => t.function.name === 'Edit')!;
    expect(edit.function.description).toBe('buffer edit');
    expect(await edit.callback({ old_string: 'x' })).toBe('buffer-edited');
  });

  test('bind strips the bound key from schemas and required lists', () => {
    const tools = llmToolsFor(['content-read', 'content-write'], { bind: { source: 'file:test' } });
    const write = tools.find(t => t.function.name === 'Write')!;
    const params = write.function.parameters as any;
    expect(Object.keys(params.properties)).toEqual(['path', 'content']);
    expect(params.required).toEqual(['path', 'content']);
    const read = tools.find(t => t.function.name === 'Read')!;
    expect(Object.keys((read.function.parameters as any).properties)).toEqual(['path']);
  });

  test('omit excludes a tool from the selection', () => {
    const tools = llmToolsFor(['content-write'], { omit: ['Write'] });
    expect(tools.map(t => t.function.name)).not.toContain('Write');
  });
});
