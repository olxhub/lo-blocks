// src/lib/util/requirements.js
import { getValueById } from '@/lib/blocks';
import * as state from '@/lib/state';

function checkRequirementValue(requirement, value) {
  // TODO the requirement might include an operation like `score>0.8`
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function requirementValueFromGrader(props, id) {
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

export async function isRequirementSatisfied(props, requirement) {
  if (!requirement?.id) return false;
  try {
    const blockValue = await getValueById(props, requirement.id);
    if (blockValue !== undefined) {
      return checkRequirementValue(requirement, blockValue);
    }
  } catch (error) {
    console.warn(`[Chat] getValueById failed for wait requirement ${requirement.id}`, error);
  }
  const blockScore = requirementValueFromGrader(props, requirement.id);
  return checkRequirementValue(requirement, blockScore);
}

/**
 * Check if all wait requirements are satisfied
 * @param {Object} props - Component props for context
 * @param {Array} requirements - Array of requirement objects with {id}
 * @returns {Promise<boolean>} - True if all requirements are satisfied
 */
export async function checkRequirements(props, requirements) {
  if (!requirements?.length) return true;
  try {
    const results = await Promise.all(
      requirements.map(async (requirement) => {
        try {
          return await isRequirementSatisfied(props, requirement);
        } catch (error) {
          console.warn(`[Chat] Failed to resolve wait requirement ${requirement.id}`, error);
          return false;
        }
      })
    );
    return results.every(Boolean);
  } catch (error) {
    console.warn('[Chat] Failed to resolve wait requirements', error);
    return false;
  }
}
