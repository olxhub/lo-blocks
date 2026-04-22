import { describe, it, expect, beforeEach } from 'vitest';
import { StorageManager, initStorage, getStorageManager, resetStorage } from './storageManager';
import { InMemoryStorageProvider } from './providers/memory';
import { toContentNamespace } from './types';

describe('StorageManager', () => {
  beforeEach(() => resetStorage());

  const localNs = toContentNamespace('local');
  const docsNs = toContentNamespace('docs');

  function makeManager() {
    const localProvider = new InMemoryStorageProvider(
      { 'foo.olx': '<Foo/>' },
      '',
      { namespace: 'local' },
    );
    const docsProvider = new InMemoryStorageProvider(
      { 'README.md': '# Docs' },
      '',
      { namespace: 'docs' },
    );
    return new StorageManager({
      defaultNamespace: localNs,
      namespaces: {
        local: [localProvider],
        docs: [docsProvider],
      },
    });
  }

  it('getDefaultProvider returns the default namespace provider', async () => {
    const mgr = makeManager();
    const provider = mgr.getDefaultProvider();
    const result = await provider.read('foo.olx' as any);
    expect(result.content).toBe('<Foo/>');
  });

  it('getProvider returns a specific namespace provider', async () => {
    const mgr = makeManager();
    const provider = mgr.getProvider(docsNs);
    const result = await provider.read('README.md' as any);
    expect(result.content).toBe('# Docs');
  });

  it('getProvider throws for unknown namespace', () => {
    const mgr = makeManager();
    expect(() => mgr.getProvider(toContentNamespace('unknown'))).toThrow(
      /No storage provider configured for namespace "unknown"/,
    );
  });

  it('listNamespaces returns all configured namespaces', () => {
    const mgr = makeManager();
    const ns = mgr.listNamespaces();
    expect(ns).toContain(localNs);
    expect(ns).toContain(docsNs);
    expect(ns).toHaveLength(2);
  });

  it('defaultNamespace returns the configured default', () => {
    const mgr = makeManager();
    expect(mgr.defaultNamespace).toBe(localNs);
  });
});

describe('singleton', () => {
  beforeEach(() => resetStorage());

  it('getStorageManager throws if not initialized', () => {
    expect(() => getStorageManager()).toThrow(/not initialized/);
  });

  it('initStorage + getStorageManager round-trips', async () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: {
        local: [new InMemoryStorageProvider({ 'a.olx': '<A/>' }, '', { namespace: 'local' })],
      },
    });
    const mgr = getStorageManager();
    const result = await mgr.getDefaultProvider().read('a.olx' as any);
    expect(result.content).toBe('<A/>');
  });

  it('initStorage replaces previous config', async () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: {
        local: [new InMemoryStorageProvider({ 'a.olx': '<A/>' }, '', { namespace: 'local' })],
      },
    });
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: {
        local: [new InMemoryStorageProvider({ 'b.olx': '<B/>' }, '', { namespace: 'local' })],
      },
    });
    const result = await getStorageManager().getDefaultProvider().read('b.olx' as any);
    expect(result.content).toBe('<B/>');
  });

  it('resetStorage clears the singleton', () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: {
        local: [new InMemoryStorageProvider({}, '', { namespace: 'local' })],
      },
    });
    resetStorage();
    expect(() => getStorageManager()).toThrow(/not initialized/);
  });
});

describe('stacked provider composition', () => {
  beforeEach(() => resetStorage());

  it('wraps multiple providers in StackedStorageProvider', async () => {
    // Higher priority provider has foo.olx, lower has bar.olx
    const high = new InMemoryStorageProvider({ 'foo.olx': '<High/>' }, '', { namespace: 'local' });
    const low = new InMemoryStorageProvider({ 'bar.olx': '<Low/>' }, '', { namespace: 'local' });

    const mgr = new StorageManager({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [high, low] },
    });

    const provider = mgr.getDefaultProvider();
    // Both files accessible
    expect((await provider.read('foo.olx' as any)).content).toBe('<High/>');
    expect((await provider.read('bar.olx' as any)).content).toBe('<Low/>');
  });

  it('higher priority provider shadows lower for same file', async () => {
    const high = new InMemoryStorageProvider({ 'foo.olx': '<High/>' }, '', { namespace: 'local' });
    const low = new InMemoryStorageProvider({ 'foo.olx': '<Low/>' }, '', { namespace: 'local' });

    const mgr = new StorageManager({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [high, low] },
    });

    const result = await mgr.getDefaultProvider().read('foo.olx' as any);
    expect(result.content).toBe('<High/>');
  });
});
