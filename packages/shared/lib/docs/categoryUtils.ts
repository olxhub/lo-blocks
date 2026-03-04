// src/lib/docs/categoryUtils.ts
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
  'reference': 'Reference',
  'specialized': 'Specialized',
  'utility': 'Utility',
  'CapaProblem': 'CAPA Problems',
  '_test': 'Test Blocks',
  'grammar': 'Grammars',
};

// Preferred display order for categories
export const CATEGORY_ORDER = [
  'Layout',
  'Display',
  'Input',
  'Grading',
  'Action',
  'Reference',
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
  if (!block.source) return 'Other';
  const match = block.source.match(/src\/components\/blocks\/([^/]+)\//);
  return match ? (CATEGORY_MAP[match[1]] || match[1]) : 'Other';
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
