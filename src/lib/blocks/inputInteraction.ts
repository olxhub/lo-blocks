// src/lib/blocks/inputInteraction.js
//
// Input interaction state management - determines when inputs should be read-only
//
// Provides a clean abstraction for inputs to query their interaction state based on
// related grader correctness states. This replaces the problematic "submitted" boolean
// approach with a proper state query system based on existing correctness states.
//
import { CORRECTNESS } from './correctness';
import { inferRelatedNodes } from './olxdom';
import * as state from '@/lib/state';

/**
 * Determines if an input should be read-only
 *
 * Priority order:
 * 1. Explicit readOnly prop (for Survey, custom containers, etc.)
 * 2. Related grader correctness state (for CapaProblem, graded contexts)
 * 3. Default to interactive (fail open)
 *
 * @param {Object} props - Component props with nodeInfo and state access
 * @returns {boolean} - True if input should be read-only
 */
export function isInputReadOnly(props) {
  // 1. Check for explicit readOnly prop (takes precedence)
  if (props.readOnly !== undefined) {
    return Boolean(props.readOnly);
  }

  // 2. Try to determine from related grader states
  const graderIds = inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader,
    infer: true
  });

  if (graderIds.length === 0) {
    // No graders found - input remains interactive
    return false;
  }

  // Check correctness state of related graders
  // For now, use the first grader - in the future we might want more sophisticated logic
  const graderId = graderIds[0];

  try {
    const correctField = state.componentFieldByName(props, graderId, 'correct');
    const correctness = state.useFieldSelector(
      props,
      correctField,
      {
        id: graderId,
        fallback: CORRECTNESS.UNSUBMITTED,
        selector: s => s?.correct
      }
    );

    // Default behavior: allow infinite attempts (only lock if explicitly SUBMITTED and not allowing retries)
    // For now, we'll be more permissive - only lock on SUBMITTED pending grading
    // TODO: Add attempt limiting logic based on container configuration
    return correctness === CORRECTNESS.SUBMITTED;

  } catch (e) {
    // If we can't determine grader state, default to interactive (fail open)
    console.warn('Could not determine grader correctness state, defaulting to interactive', e);
    return false;
  }
}

/**
 * Gets a descriptive interaction mode for debugging/display
 * @dev - Development/debugging helper function
 *
 * @param {Object} props - Component props
 * @returns {string} - 'interactive', 'read-only', or 'no-grader'
 */
function getInputInteractionMode(props) {
  const graderIds = inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader,
    infer: true
  });

  if (graderIds.length === 0) {
    return 'no-grader';
  }

  return isInputReadOnly(props) ? 'read-only' : 'interactive';
}