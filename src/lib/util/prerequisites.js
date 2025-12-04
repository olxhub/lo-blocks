// src/lib/util/prerequisites.js
/**
 * This is a set of helpers for expressing whether we are ready to take
 * some action, such as a student advancing to the next set of exercises.
 * In most cases, this might be simply checking whether some set of exercises
 * is finished, but there may be more complex dependencies as well.
 * 
 * We are still evaluating the right format for this, but this version should
 * be sufficient for the current SBAs. We are less than comfortable with the
 * level of regexps used and the code complexity, and we need a documented,
 * human-friendly format to use in the courseware. This is the start of a
 * work-in-progress
 */
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

export async function isPrerequisiteSatisfied(props, prerequisite) {
  if (!prerequisite?.id) return false;
  try {
    const blockValue = await getValueById(props, prerequisite.id);
    if (blockValue !== undefined) {
      return checkPrerequisiteValue(prerequisite, blockValue);
    }
  } catch (error) {
    console.warn(`[Chat] getValueById failed for wait prerequisite ${prerequisite.id}`, error);
  }
  const blockScore = prerequisiteValueFromGrader(props, prerequisite.id);
  return checkPrerequisiteValue(prerequisite, blockScore);
}

/**
 * Check if all wait prerequisites are satisfied
 * @param {Object} props - Component props for context
 * @param {Array} prerequisites - Array of prerequisite objects with {id}
 * @returns {Promise<boolean>} - True if all prerequisites are satisfied
 */
export async function checkPrerequisites(props, prerequisites) {
  if (!prerequisites?.length) return true;
  try {
    const results = await Promise.all(
      prerequisites.map(async (prerequisite) => {
        try {
          return await isPrerequisiteSatisfied(props, prerequisite);
        } catch (error) {
          console.warn(`[Chat] Failed to resolve wait prerequisite ${prerequisite.id}`, error);
          return false;
        }
      })
    );
    return results.every(Boolean);
  } catch (error) {
    console.warn('[Chat] Failed to resolve wait prerequisites', error);
    return false;
  }
}
