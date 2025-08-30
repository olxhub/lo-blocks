// src/components/blocks/Sortable/sortableUtils.js

import * as parserModule from './_sortParser.js';

const parser = parserModule.default || parserModule;

/**
 * Parse sortable content from .sortpeg format
 * @param {string} content - Raw content from .sortpeg file
 * @returns {ParsedSortable} Parsed sortable configuration
 */
export function parseSortableContent(content) {
  return parser.parse(content);
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate initial arrangement of items
 * @param {SortableItem[]} items - Items to arrange
 * @param {boolean} shuffle - Whether to shuffle initially
 * @returns {string[]} Array of item IDs in initial order
 */
export function generateInitialArrangement(items, shuffle = true) {
  const arrangement = items.map(item => item.id);
  return shuffle ? shuffleArray(arrangement) : arrangement;
}

/**
 * Get item by ID from items array
 * @param {SortableItem[]} items - Items array
 * @param {string} itemId - Item ID to find
 * @returns {SortableItem|undefined} Found item or undefined
 */
export function getItemById(items, itemId) {
  return items.find(item => item.id === itemId);
}