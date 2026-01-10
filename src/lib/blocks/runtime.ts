// src/lib/blocks/runtime.ts
//
// Dynamic block runtime - single module exposing everything dynamic blocks need.
//
// When blocks are compiled with esbuild, imports like `@/lib/blocks` are rewritten
// to `@lo-blocks/runtime`. This module provides all those exports in one place,
// resolved via import map in the browser.
//
// Usage in dynamic blocks:
//   import { core, parsers, state } from '@lo-blocks/runtime';
//

// Re-export React so blocks don't need separate import
export { default as React } from 'react';

// Block creation
export { blocks } from './factory';
export { core, dev, test } from './namespaces';
export { createGrader } from './createGrader';

// Parsers
export * as parsers from '@/lib/content/parsers';

// State management
export * as state from '@/lib/state';
export { fields, fieldSelector, commonFields, useReduxState, useReduxInput, useValue } from '@/lib/state';

// Attribute schemas
export { baseAttributes, srcAttributes, placeholder } from './attributeSchemas';

// Zod for custom schemas
export { z } from 'zod';

// Render utilities (for blocks that render kids)
export { useKids, useBlock } from './useRenderedBlock';

// OLX DOM utilities
export { getBlockByOLXId, getBlocksByOLXIds } from './getBlockByOLXId';

// Types - re-export commonly used types
export type { RuntimeProps, LoBlock, OlxJson } from '@/lib/types';
