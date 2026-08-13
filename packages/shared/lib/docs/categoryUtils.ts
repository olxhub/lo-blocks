// packages/shared/lib/docs/categoryUtils.ts
//
// Shared utilities for categorizing blocks and grammars.
// Used by both /docs page and Studio sidebar.
//

// Map internal category identifiers to display names
export const CATEGORY_MAP: Record<string, string> = {
  'display': 'Display',
  'input': 'Input',
  'grading': 'Grading',
  'layout': 'Layout',
  'action': 'Action',
  'authoring': 'Authoring',
  'reference': 'Reference',
  'scenario': 'Scenario',
  'specialized': 'Specialized',
  'utility': 'Utility',
  'CapaProblem': 'CAPA Problems',
  '_test': 'Test Blocks',
  'language-arts': 'Language Arts',
  'analytics': 'Analytics',
  'grammar': 'Grammars',
};

// Preferred display order for categories
export const CATEGORY_ORDER = [
  'Layout',
  'Display',
  'Input',
  'Grading',
  'Action',
  'Authoring',
  'Reference',
  'Language Arts',
  'Analytics',
  'Scenario',
  'Specialized',
  'Utility',
  'CAPA Problems',
  'Test Blocks',
  'Grammars',
  'Other',
];

export interface BlockLike {
  name: string;
  category?: string | null;
  source?: string;
}

/**
 * Get the display category name for a block.
 * Uses explicit category if available, otherwise infers from source path.
 */
export function getCategory(block: BlockLike): string {
  // Explicit category takes precedence
  if (block.category) {
    return CATEGORY_MAP[block.category] || block.category;
  }
  // Fall back to directory-based categorization
  // block.source paths are forward-slash-normalized by generateBlockRegistry.js
  if (!block.source) return 'Other';
  const match = block.source.match(/components\/blocks\/([^/]+)\//);
  return match ? (CATEGORY_MAP[match[1]] || match[1]) : 'Other';
}

/**
 * Get all categories for a block as an array.
 *
 * Returns real categories only (explicit + directory-inferred), not the block
 * name. When LoBlock gains `categories: string[]`, this function will return
 * the union.
 */
export function getCategories(block: BlockLike): string[] {
  const cats = new Set<string>();

  // Explicit category
  if (block.category) {
    cats.add(CATEGORY_MAP[block.category] || block.category);
  }

  // Directory-inferred category
  // block.source paths are forward-slash-normalized by generateBlockRegistry.js
  if (block.source) {
    const match = block.source.match(/components\/blocks\/([^/]+)\//);
    if (match) cats.add(CATEGORY_MAP[match[1]] || match[1]);
  }

  if (cats.size === 0) cats.add('Other');

  return [...cats];
}

/**
 * Group blocks by their display category.
 * Returns categories in the preferred display order.
 */
export function groupBlocksByCategory<T extends BlockLike>(
  blocks: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};

  // Group blocks
  blocks.forEach(block => {
    const category = getCategory(block);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(block);
  });

  // Sort by defined order
  const sorted: Record<string, T[]> = {};
  CATEGORY_ORDER.forEach(cat => {
    if (grouped[cat]) sorted[cat] = grouped[cat];
  });
  // Add any remaining categories not in the order list
  Object.keys(grouped).forEach(cat => {
    if (!sorted[cat]) sorted[cat] = grouped[cat];
  });

  return sorted;
}

/**
 * Sort category names according to the preferred display order.
 */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const aIdx = CATEGORY_ORDER.indexOf(a);
    const bIdx = CATEGORY_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}
