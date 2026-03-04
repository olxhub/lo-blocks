// src/lib/docs/index.ts
//
// Documentation utilities - shared logic for docs page and Studio.
//
export {
  CATEGORY_MAP,
  CATEGORY_ORDER,
  getCategory,
  groupBlocksByCategory,
  sortCategories,
} from './categoryUtils';

export type { BlockLike } from './categoryUtils';

export { useDocsData } from './useDocsData';
export type { BlockDoc, GrammarDoc, DocsData } from './useDocsData';

export { extractAttributes } from './schemaUtils';
export type { AttributeDoc } from './schemaUtils';
