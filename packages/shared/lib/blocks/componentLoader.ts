// packages/shared/lib/blocks/componentLoader.ts
//
// Registry-side half of the blueprint/component split (see ComponentLoader
// in lib/types/core.ts): attach and resolve loaders WITHOUT touching React
// hooks. This module is imported by blockRegistryAutogen.ts, which node
// consumers (parseOLX, scripts) and Next.js SERVER routes import — so
// nothing here may force client-component semantics onto that chain.
//
// The render-side half — the lazy wrapper with hooks and a spinner — lives
// in lazyBlockComponent.tsx, imported only from render paths.

import type React from 'react';
import type { LoBlock, ComponentLoader } from '@/lib/types';

/** Headless blocks (actions, graders) render nothing. Shared identity so
 *  every headless block resolves to the same stable component. */
export const NullComponent: React.ComponentType<any> = () => null;

/**
 * Attach a conventional loader to a block that declared neither `component`
 * nor `componentLoader`. Called by the generated registry
 * (blockRegistryAutogen.ts) to wire the sibling `_Name` component file;
 * blueprint declarations always win.
 */
export function withComponentLoader(block: LoBlock, loader: ComponentLoader): LoBlock {
  if (!block.component && !block.componentLoader) {
    block.componentLoader = loader;
  }
  return block;
}

/**
 * Resolve components ahead of render — the "above the fold" hook. Blocks
 * whose loaders resolve before their first render get their component
 * directly, with no lazy wrapper or spinner at all.
 *
 * Load failures reject; callers decide whether that's fatal (a build-time
 * preload) or ignorable (an idle-time prefetch — the lazy render path will
 * retry and surface the error in place).
 */
export async function preloadBlockComponents(blocks: LoBlock[]): Promise<void> {
  await Promise.all(blocks.map(async (block) => {
    if (block.component || !block.componentLoader) return;
    block.component = await block.componentLoader();
  }));
}

/** Does this block render anything? (Headless action/grader blocks don't.)
 *  Descriptor-level question — answerable without loading the component. */
export function blockHasComponent(block: LoBlock): boolean {
  return Boolean(block.component || block.componentLoader);
}
