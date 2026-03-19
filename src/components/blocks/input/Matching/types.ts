/**
 * Core data types for the Matching block system
 */

export interface MatchingItem {
  /** Unique identifier for this item (from OLX id or auto-generated) */
  id: string;
  /** Content to display (OLX kid reference) */
  content: any; // Kid node from parser
  /** Whether this is a left or right item */
  side: 'left' | 'right';
  /** Optional initial display position (1-indexed, like initialPosition from Sortable) */
  initialPosition?: number;
}

/**
 * Student's current matching state: left item ID → right item ID
 */
export type MatchingArrangement = Record<string, string>;

/**
 * Connection line data for rendering
 */
export interface ConnectionLine {
  fromId: string;
  toId: string;
  isCorrect?: boolean;
  isStudent?: boolean;
}

/**
 * Position of an item's connection point
 */
export interface ItemPosition {
  itemId: string;
  x: number;
  y: number;
}

/**
 * Grading result for a matching exercise
 */
export interface MatchingGradingResult {
  correct: string; // CORRECTNESS enum value
  score: number; // 0-1
  message: string;
  correctMatches?: number;
  totalMatches?: number;
}
