import { describe, it, expect, beforeEach } from 'vitest';
import { handleMcpRequest, TOOLS } from './handler';
import { initStorage, resetStorage } from '../lofs/storageManager';
import { resetContentIndex } from '../content/contentIndex';
import { InMemoryStorageProvider } from '../lofs/providers/memory';
import { toContentNamespace } from '../types/storage';

describe('MCP handler', () => {
  beforeEach(() => {
    resetStorage();
    resetContentIndex();

    const provider = new InMemoryStorageProvider(
      {
        'hello.olx': '<Vertical id="v1"><Markdown>Hello World</Markdown></Vertical>',
        'lesson.olx': '<Vertical id="v2"><Markdown>Lesson</Markdown></Vertical>',
      },
      '',
      { namespace: 'local', writable: true },
    );
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [provider] },
    });
  });

  // -- Protocol --

  it('handles initialize', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' } },
    });
    expect(res).toBeDefined();
    expect(res!.result.protocolVersion).toBe('2024-11-05');
    expect(res!.result.serverInfo.name).toBe('lo-blocks');
    expect(res!.result.capabilities.tools).toBeDefined();
  });

  it('handles notifications/initialized (returns null)', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res).toBeNull();
  });

  it('handles ping', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(res!.result).toEqual({});
  });

  it('returns error for unknown method', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'bogus/method' });
    expect(res!.error).toBeDefined();
    expect(res!.error!.code).toBe(-32601);
  });

  // -- tools/list --

  it('lists tools', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
    expect(res!.result.tools.length).toBeGreaterThan(0);
    const names = res!.result.tools.map((t: any) => t.name);
    expect(names).toContain('lofs_read');
    expect(names).toContain('lofs_write');
    expect(names).toContain('lofs_list_blocks');
    expect(names).toContain('lofs_list_namespaces');
  });

  // -- File-level tools --

  it('lofs_read reads a file', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'lofs_read', arguments: { path: 'hello.olx' } },
    });
    expect(res!.result.content[0].text).toContain('Hello World');
  });

  it('lofs_read returns error for missing file', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'lofs_read', arguments: { path: 'nope.olx' } },
    });
    expect(res!.result.isError).toBe(true);
  });

  it('lofs_write creates a file', async () => {
    await handleMcpRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'lofs_write', arguments: { path: 'new.olx', content: '<Markdown>New</Markdown>' } },
    });
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'lofs_read', arguments: { path: 'new.olx' } },
    });
    expect(res!.result.content[0].text).toContain('New');
  });

  it('lofs_glob finds .olx files', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'lofs_glob', arguments: { pattern: '*.olx' } },
    });
    const text = res!.result.content[0].text;
    expect(text).toContain('hello.olx');
    expect(text).toContain('lesson.olx');
  });

  it('lofs_grep searches content', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'lofs_grep', arguments: { pattern: 'Hello' } },
    });
    const text = res!.result.content[0].text;
    expect(text).toContain('hello.olx');
  });

  it('lofs_list returns file tree', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'lofs_list', arguments: {} },
    });
    const tree = JSON.parse(res!.result.content[0].text);
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('lofs_delete removes a file', async () => {
    await handleMcpRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'lofs_write', arguments: { path: 'temp.olx', content: 'temporary' } },
    });
    await handleMcpRequest({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: { name: 'lofs_delete', arguments: { path: 'temp.olx' } },
    });
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: { name: 'lofs_read', arguments: { path: 'temp.olx' } },
    });
    expect(res!.result.isError).toBe(true);
  });

  // -- Block-level tools --

  it('lofs_list_blocks returns block summary', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: { name: 'lofs_list_blocks', arguments: {} },
    });
    const summary = JSON.parse(res!.result.content[0].text);
    expect(summary['v1']).toBeDefined();
    expect(summary['v2']).toBeDefined();
  });

  it('lofs_get_block returns block data', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: { name: 'lofs_get_block', arguments: { id: 'v1' } },
    });
    const block = JSON.parse(res!.result.content[0].text);
    expect(block).toBeDefined();
  });

  it('lofs_get_block returns error for missing block', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: { name: 'lofs_get_block', arguments: { id: 'nonexistent' } },
    });
    expect(res!.result.isError).toBe(true);
  });

  it('lofs_sync returns block count', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: { name: 'lofs_sync', arguments: {} },
    });
    expect(res!.result.content[0].text).toMatch(/Synced: \d+ blocks/);
  });

  it('lofs_list_namespaces returns namespaces', async () => {
    const res = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/call',
      params: { name: 'lofs_list_namespaces', arguments: {} },
    });
    expect(res!.result.content[0].text).toContain('local (default)');
  });

  // -- Tool definitions are well-formed --

  it('all tools have name, description, and inputSchema', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});
