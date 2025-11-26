// src/components/blocks/Sortable/types.ts

/**
 * Core data types for the Sortable system
 */

export interface SortableItem {
  /** Unique identifier for this item */
  id: string;
  /** Content to display (can be text or component) */
  content: string | React.ReactNode;
  /** Correct position (1-indexed) */
  correctIndex: number;
  /** Current position in student's arrangement */
  currentIndex?: number;
}

export interface ParsedSortable {
  /** Instructions/prompt for the student */
  prompt: string;
  /** Array of items to be sorted */
  items: SortableItem[];
  /** Optional grading configuration */
  grading?: GradingConfig;
  /** Whether to shuffle items initially */
  shuffle?: boolean;
}

export interface GradingConfig {
  /** Grading algorithm to use */
  algorithm: 'exact' | 'partial' | 'adjacent' | 'spearman';
  /** Whether partial credit is allowed */
  partialCredit?: boolean;
  /** Custom scoring weights */
  weights?: number[];
}

export interface GradingResult {
  /** Overall score (0-1) */
  score: number;
  /** Whether completely correct */
  isCorrect: boolean;
  /** Detailed feedback */
  feedback: string;
  /** Per-item feedback */
  itemFeedback?: { [itemId: string]: string };
}

export interface SortableState {
  /** Current arrangement of items */
  arrangement: string[]; // Array of item IDs in current order
  /** Number of attempts */
  attempts: number;
  /** Whether student has submitted */
  submitted: boolean;
  /** Last grading result */
  lastResult?: GradingResult;
}

/**
 * Drag handling configuration
 */
export interface DragConfig {
  /** How to handle drag initiation */
  dragMode: 'whole' | 'handle';
  /** CSS selector for drag handle (if dragMode is 'handle') */
  dragHandleSelector?: string;
  /** Animation duration for drops (ms) */
  animationDuration?: number;
}