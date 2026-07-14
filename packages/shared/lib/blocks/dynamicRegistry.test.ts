// packages/shared/lib/blocks/dynamicRegistry.test.ts
//
// The runtime registration API (docs/dynamic-blocks.md, prototype scope).

import { describe, it, expect, afterEach } from 'vitest';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import {
  registerDynamicBlock,
  unregisterDynamicBlock,
  getRegistryVersion,
  dynamicBlockTags,
} from './dynamicRegistry';
import { createErrorBlock } from './dynamicBlockError';

// A throwaway blueprint under a given tag — same shape a real dynamic block has.
const makeBlock = (name: string) =>
  dev({ ...parsers.text(), name, description: `test block ${name}` });

afterEach(() => {
  for (const tag of dynamicBlockTags()) unregisterDynamicBlock(tag);
});

describe('dynamic block registration', () => {
  it('registers, resolves, and unregisters a block, bumping the version each time', () => {
    const before = getRegistryVersion();
    registerDynamicBlock(makeBlock('DynAlpha'), '/src/DynAlpha.ts');

    expect(BLOCK_REGISTRY.DynAlpha?._isBlock).toBe(true);
    expect(dynamicBlockTags()).toContain('DynAlpha');
    expect(getRegistryVersion()).toBe(before + 1);

    unregisterDynamicBlock('DynAlpha');
    expect(BLOCK_REGISTRY.DynAlpha).toBeUndefined();
    expect(getRegistryVersion()).toBe(before + 2);
  });

  it('refuses to shadow a static/core block', () => {
    // Vertical is a core layout block present in every build.
    expect(BLOCK_REGISTRY.Vertical?._isBlock).toBe(true);
    expect(() => registerDynamicBlock(makeBlock('Vertical'), '/src/Vertical.ts'))
      .toThrow(/may not shadow/i);
  });

  it('reloads the same source but rejects a collision from a different source', () => {
    registerDynamicBlock(makeBlock('DynBeta'), '/a/DynBeta.ts');
    // Same source path → reload, allowed (replaces the entry).
    expect(() => registerDynamicBlock(makeBlock('DynBeta'), '/a/DynBeta.ts')).not.toThrow();
    // Different source claiming the same tag → error.
    expect(() => registerDynamicBlock(makeBlock('DynBeta'), '/b/DynBeta.ts'))
      .toThrow(/already provided by/i);
  });

  it('rejects a value that is not a block', () => {
    expect(() => registerDynamicBlock({} as any)).toThrow(/not a block/i);
  });

  it('createErrorBlock yields a valid block registrable under the failed tag', () => {
    const block = createErrorBlock('DynBroken', 'boom');
    expect(block._isBlock).toBe(true);
    expect(block.name).toBe('DynBroken');
    registerDynamicBlock(block, '/src/DynBroken.ts');
    expect(BLOCK_REGISTRY.DynBroken).toBe(block);
  });
});
