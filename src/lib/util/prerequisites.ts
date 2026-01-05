// src/lib/util/prerequisites.js
/**
 * Generic gating/prerequisite system for Learning Observer blocks.
 *
 * Supports gating on various conditions:
 * - Component has value: `componentId` (non-empty string, array with items, etc.)
 * - Specific field value: `componentId fieldName` (e.g., `grader correct`)
 * - Numeric comparison: `componentId fieldName >= 0.8` (e.g., `grader score >= 0.8`)
 * - Status check: `componentId status` (e.g., `llm_action complete`)
 *
 * Usage:
 *   // Reactive hook (recommended) - re-renders when values change
 *   const satisfied = usePrerequisitesSatisfied(props, 'input1, input2');
 *
 *   // Selector for custom useSelector usage
 *   const satisfied = useSelector(state =>
 *     prerequisitesSatisfiedSelector(props, state, prerequisites)
 *   );
 *
 *   // Imperative (legacy) - does NOT react to changes
 *   const satisfied = await checkPrerequisites(props, prerequisites);
 */
import { useSelector } from 'react-redux';
import { getValueById } from '@/lib/blocks';
import * as state from '@/lib/state';

const IDENTIFIER_REGEX = '[A-Za-z0-9_][A-Za-z0-9_-]*';
const STATUS_PREREQUISITE = new RegExp(`^(${IDENTIFIER_REGEX})\\s+(${IDENTIFIER_REGEX})$`);
const COMPARISON_PREREQUISITE = new RegExp(
  `^(${IDENTIFIER_REGEX})\\s+(${IDENTIFIER_REGEX})\\s*(>=|<=|>|<|=)\\s*(\\d+(?:\\.\\d+)?)$`
);

function parseSinglePrerequisite(prerequisite) {
  if (typeof prerequisite !== 'string') return null;
  const trimmed = prerequisite.trim();
  if (!trimmed) return null;

  const comparisonMatch = trimmed.match(COMPARISON_PREREQUISITE);
  if (comparisonMatch) {
    return {
      id: comparisonMatch[1],
      field: comparisonMatch[2],
      op: comparisonMatch[3],
      value: parseFloat(comparisonMatch[4])
    };
  }

  const statusMatch = trimmed.match(STATUS_PREREQUISITE);
  if (statusMatch) {
    return { id: statusMatch[1], status: statusMatch[2] };
  }

  const idMatch = trimmed.match(new RegExp(`^${IDENTIFIER_REGEX}$`));
  if (idMatch) {
    return { id: idMatch[0] };
  }

  console.warn(`[prerequisites] Unable to parse prerequisite expression "${prerequisite}"`);
  return null;
}

export function parsePrerequisites(dependsOn) {
  if (!dependsOn) return [];

  if (Array.isArray(dependsOn)) {
    return dependsOn
      .map((req) => (typeof req === 'string' ? parseSinglePrerequisite(req) : req))
      .filter(Boolean);
  }

  if (typeof dependsOn !== 'string') {
    console.warn('[prerequisites] dependsOn must be a string or array');
    return [];
  }

  return dependsOn
    .split(',')
    .map((req) => parseSinglePrerequisite(req))
    .filter(Boolean);
}

function resolvePrerequisiteValue(prerequisite, value) {
  if (prerequisite?.field && value && typeof value === 'object') {
    return value[prerequisite.field];
  }
  return value;
}

function normalizeNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function checkPrerequisiteValue(prerequisite, value) {
  const resolvedValue = resolvePrerequisiteValue(prerequisite, value);

  if (prerequisite?.op && prerequisite?.value !== undefined) {
    const actualNumber = normalizeNumber(resolvedValue);
    const expectedNumber = normalizeNumber(prerequisite.value);
    if (actualNumber == null || expectedNumber == null) return false;

    switch (prerequisite.op) {
      case '>':
        return actualNumber > expectedNumber;
      case '>=':
        return actualNumber >= expectedNumber;
      case '<':
        return actualNumber < expectedNumber;
      case '<=':
        return actualNumber <= expectedNumber;
      case '=':
        return actualNumber === expectedNumber;
      default:
        return false;
    }
  }

  if (prerequisite?.status) {
    if (resolvedValue == null) return false;
    return String(resolvedValue).toLowerCase() === String(prerequisite.status).toLowerCase();
  }

  if (resolvedValue == null) return false;
  if (Array.isArray(resolvedValue)) return resolvedValue.length > 0;
  if (typeof resolvedValue === 'string') return resolvedValue.trim().length > 0;
  if (typeof resolvedValue === 'number') return resolvedValue > 0;
  if (typeof resolvedValue === 'boolean') return resolvedValue;
  if (resolvedValue instanceof Date) return true;
  if (typeof resolvedValue === 'object') return Object.keys(resolvedValue).length > 0;
  return Boolean(resolvedValue);
}

function prerequisiteValueFromGrader(props, id) {
  try {
    const correctField = state.componentFieldByName(props, id, 'correct');
    return state.selectFromStore(correctField, {
      id,
      fallback: 0,
      selector: (s) => s?.score ?? s
    });
  } catch (error) {
    console.warn(`[Chat] Unable to read grader correctness for ${id}`, error);
    return undefined;
  }
}

export function isPrerequisiteSatisfied(props, prerequisite) {
  if (!prerequisite?.id) return false;
  try {
    const blockValue = getValueById(props, prerequisite.id);
    if (blockValue !== undefined) {
      return checkPrerequisiteValue(prerequisite, blockValue);
    }
  } catch (error) {
    console.warn(`[prereq] getValueById failed for ${prerequisite.id}`, error);
  }
  const blockScore = prerequisiteValueFromGrader(props, prerequisite.id);
  return checkPrerequisiteValue(prerequisite, blockScore);
}

/**
 * Check if all wait prerequisites are satisfied (legacy version)
 * @param {Object} props - Component props for context
 * @param {Array} prerequisites - Array of prerequisite objects with {id}
 * @returns {boolean} - True if all prerequisites are satisfied
 * @deprecated Use usePrerequisitesSatisfied hook for reactive updates
 */
export function checkPrerequisites(props, prerequisites) {
  if (!prerequisites?.length) return true;
  try {
    return prerequisites.every((prerequisite) => {
      try {
        return isPrerequisiteSatisfied(props, prerequisite);
      } catch (error) {
        console.warn(`[Chat] Failed to resolve wait prerequisite ${prerequisite.id}`, error);
        return false;
      }
    });
  } catch (error) {
    console.warn('[Chat] Failed to resolve wait prerequisites', error);
    return false;
  }
}

/* ================================================================
 * REACTIVE GATING - Selector and Hook
 * ================================================================ */

/**
 * Check if a single prerequisite is satisfied (synchronous, for use in selectors).
 *
 * @param {Object} props - Component props with blockRegistry
 * @param {Object} reduxState - Current Redux state
 * @param {Object} prerequisite - Parsed prerequisite {id, field?, op?, value?, status?}
 * @returns {boolean} - True if prerequisite is satisfied
 */
export function isPrerequisiteSatisfiedSync(props, reduxState, prerequisite) {
  if (!prerequisite?.id) return false;

  // HACK: Force absolute path for cross-block references.
  // See Ref.js for detailed explanation of this workaround.
  // TODO: Unify ID resolution so this hack isn't needed.
  const absoluteId = prerequisite.id.startsWith('/') ? prerequisite.id : `/${prerequisite.id}`;

  try {
    // Get the component's value using valueSelector (synchronous)
    const blockValue = state.valueSelector(props, reduxState, absoluteId, { fallback: undefined });

    if (blockValue !== undefined) {
      return checkPrerequisiteValue(prerequisite, blockValue);
    }
  } catch (error) {
    // Component not found or other error - try grader fallback
  }

  // Fallback: check grader score field
  try {
    const correctField = state.componentFieldByName(props, prerequisite.id, 'correct');
    const graderValue = state.fieldSelector(reduxState, props, correctField, {
      id: absoluteId,
      fallback: 0,
      selector: (s) => s?.score ?? s
    });
    return checkPrerequisiteValue(prerequisite, graderValue);
  } catch (error) {
    return false;
  }
}

/**
 * Selector: Check if all prerequisites are satisfied.
 * Use inside useSelector for reactive updates.
 *
 * @param {Object} props - Component props with blockRegistry
 * @param {Object} reduxState - Current Redux state
 * @param {string|Array} prerequisites - Comma-separated string or array of prerequisite expressions
 * @returns {boolean} - True if all prerequisites are satisfied
 *
 * @example
 * const satisfied = useSelector(state =>
 *   prerequisitesSatisfiedSelector(props, state, 'input1, input2')
 * );
 */
export function prerequisitesSatisfiedSelector(props, reduxState, prerequisites) {
  const parsed = typeof prerequisites === 'string' || Array.isArray(prerequisites)
    ? parsePrerequisites(prerequisites)
    : prerequisites;

  if (!parsed?.length) return true;

  return parsed.every(prereq => isPrerequisiteSatisfiedSync(props, reduxState, prereq));
}

/**
 * Hook: Reactively check if prerequisites are satisfied.
 * Re-renders component when prerequisite values change.
 *
 * @param {Object} props - Component props with blockRegistry
 * @param {string|Array} prerequisites - Comma-separated string or array of prerequisite expressions
 * @returns {boolean} - True if all prerequisites are satisfied
 *
 * @example
 * function MyGatedComponent(props) {
 *   const canProceed = usePrerequisitesSatisfied(props, 'textArea1, checkbox1');
 *   return <button disabled={!canProceed}>Continue</button>;
 * }
 */
export function usePrerequisitesSatisfied(props, prerequisites) {
  const parsed = typeof prerequisites === 'string' || Array.isArray(prerequisites)
    ? parsePrerequisites(prerequisites)
    : prerequisites;

  return useSelector(
    (reduxState) => {
      if (!parsed?.length) return true;
      return parsed.every(prereq => isPrerequisiteSatisfiedSync(props, reduxState, prereq));
    }
  );
}
