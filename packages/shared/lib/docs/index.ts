// packages/shared/lib/docs/index.ts
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

export { extractAttributes, AttributeDocSchema } from './schemaUtils';
export type { AttributeDoc } from './schemaUtils';
