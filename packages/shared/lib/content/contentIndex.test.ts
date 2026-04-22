import { describe, it, expect, beforeEach } from 'vitest';
import { ContentIndex, getContentIndex, resetContentIndex } from './contentIndex';
import { initStorage, resetStorage } from '../lofs/storageManager';
import { InMemoryStorageProvider } from '../lofs/providers/memory';
import { toContentNamespace } from '../lofs/types';

describe('ContentIndex', () => {
  beforeEach(() => {
    resetStorage();
    resetContentIndex();
  });

  it('can be instantiated', () => {
    const index = new ContentIndex();
    expect(index).toBeDefined();
  });

  it('getProvider returns the storage provider for a namespace', () => {
    const provider = new InMemoryStorageProvider(
      { 'test.olx': '<Vertical id="v1"><Markdown>Hello</Markdown></Vertical>' },
      '',
      { namespace: 'local' },
    );
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [provider] },
    });

    const index = new ContentIndex();
    const p = index.getProvider();
    expect(p).toBeDefined();
    expect(p.scheme).toBe('memory');
  });

  it('sync parses content and returns idMap', async () => {
    const provider = new InMemoryStorageProvider(
      { 'test.olx': '<Vertical id="v1"><Markdown>Hello</Markdown></Vertical>' },
      '',
      { namespace: 'local' },
    );
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [provider] },
    });

    const index = new ContentIndex();
    const { idMap, errors } = await index.sync();

    expect(idMap).toBeDefined();
    expect(idMap['v1']).toBeDefined();
    expect(errors).toHaveLength(0);
  });

  it('getIdMap returns the same idMap as sync', async () => {
    const provider = new InMemoryStorageProvider(
      { 'test.olx': '<Vertical id="v1"><Markdown>Hello</Markdown></Vertical>' },
      '',
      { namespace: 'local' },
    );
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [provider] },
    });

    const index = new ContentIndex();
    const idMap = await index.getIdMap();
    expect(idMap['v1']).toBeDefined();
  });
});

describe('singleton', () => {
  beforeEach(() => {
    resetStorage();
    resetContentIndex();
  });

  it('getContentIndex returns a ContentIndex', () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [new InMemoryStorageProvider({}, '', { namespace: 'local' })] },
    });
    expect(getContentIndex()).toBeInstanceOf(ContentIndex);
  });

  it('getContentIndex returns the same instance', () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [new InMemoryStorageProvider({}, '', { namespace: 'local' })] },
    });
    expect(getContentIndex()).toBe(getContentIndex());
  });

  it('resetContentIndex clears the singleton', () => {
    initStorage({
      defaultNamespace: toContentNamespace('local'),
      namespaces: { local: [new InMemoryStorageProvider({}, '', { namespace: 'local' })] },
    });
    const first = getContentIndex();
    resetContentIndex();
    const second = getContentIndex();
    expect(first).not.toBe(second);
  });
});
