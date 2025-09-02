// src/components/blocks/TextHighlight/textHighlightUtils.js
import * as parserModule from './_textHighlightParser.js';
const parser = parserModule.default || parserModule;

export function parseTextHighlight(input) {
  try {
    return parser.parse(input);
  } catch (error) {
    console.error('TextHighlight parse error:', error);
    return {
      prompt: 'Parse error - check format',
      segments: [{ type: 'text', content: input }],
      scoring: [],
      targetedFeedback: {},
      error: error.message
    };
  }
}

/**
 * Evaluate student selections against the parsed highlight data
 * @param {Object} parsed - Parsed highlight data from PEG
 * @param {Set} selectedIndices - Set of segment indices that student selected
 * @returns {Object} Evaluation result with score and feedback
 */
export function evaluateSelections(parsed, selectedIndices) {
  const results = {
    requiredFound: 0,
    requiredTotal: 0,
    incorrectSelections: 0,
    feedbackTriggers: [],
    selectedIds: []
  };

  // Count required segments and check selections
  parsed.segments.forEach((segment, index) => {
    const isSelected = selectedIndices.has(index);

    if (segment.type === 'required') {
      results.requiredTotal++;
      if (isSelected) {
        results.requiredFound++;
        if (segment.id) {
          results.selectedIds.push(segment.id);
        }
      }
    } else if (segment.type === 'optional') {
      // Optional segments don't affect scoring
      if (isSelected && segment.id) {
        results.selectedIds.push(segment.id);
      }
    } else if (segment.type === 'feedback_trigger') {
      if (isSelected) {
        results.feedbackTriggers.push(segment.id || segment.content);
        results.incorrectSelections++;
      }
    } else if (segment.type === 'text') {
      if (isSelected) {
        results.incorrectSelections++;
      }
    }
  });

  // Find matching scoring rule
  const scoringFeedback = findScoringFeedback(parsed.scoring, results);

  // Collect targeted feedback
  const targetedMessages = [];
  results.selectedIds.forEach(id => {
    if (parsed.targetedFeedback[id]) {
      targetedMessages.push(parsed.targetedFeedback[id]);
    }
  });
  results.feedbackTriggers.forEach(trigger => {
    if (parsed.targetedFeedback[trigger]) {
      targetedMessages.push(parsed.targetedFeedback[trigger]);
    }
  });

  return {
    score: results.requiredFound / Math.max(results.requiredTotal, 1),
    requiredFound: results.requiredFound,
    requiredTotal: results.requiredTotal,
    incorrectSelections: results.incorrectSelections,
    scoringFeedback,
    targetedFeedback: targetedMessages,
    isComplete: results.requiredFound === results.requiredTotal && results.incorrectSelections === 0
  };
}

/**
 * Find the first matching scoring rule
 */
function findScoringFeedback(scoringRules, results) {
  if (!scoringRules || scoringRules.length === 0) {
    // Default feedback
    if (results.requiredFound === results.requiredTotal && results.incorrectSelections === 0) {
      return 'Perfect!';
    } else if (results.requiredFound > 0) {
      return `Found ${results.requiredFound} of ${results.requiredTotal}`;
    } else {
      return 'Select the highlighted text';
    }
  }

  for (const rule of scoringRules) {
    if (evaluateCondition(rule.condition, results)) {
      return rule.feedback;
    }
  }

  // Return last rule if no conditions match (default case)
  return scoringRules[scoringRules.length - 1]?.feedback || '';
}

/**
 * Evaluate a scoring condition
 */
function evaluateCondition(condition, results) {
  if (!condition || condition === '') {
    return true; // Default/fallback condition
  }

  if (condition === 'all') {
    return results.requiredFound === results.requiredTotal && results.incorrectSelections === 0;
  }

  // Parse complex conditions like ">2,errors<1"
  const parts = condition.split(',');
  return parts.every(part => evaluateSingleCondition(part.trim(), results));
}

/**
 * Evaluate a single condition part
 */
function evaluateSingleCondition(condition, results) {
  // Match patterns like "found>2", ">3", "errors<1"
  const match = condition.match(/^(found|errors|incorrect)?([><=]+)(\d+)$/);
  if (!match) return false;

  const [, field, op, numStr] = match;
  const num = parseInt(numStr, 10);

  let value;
  if (field === 'found') {
    value = results.requiredFound;
  } else if (field === 'errors' || field === 'incorrect') {
    value = results.incorrectSelections;
  } else {
    // No field specified, default to requiredFound
    value = results.requiredFound;
  }

  switch (op) {
    case '>': return value > num;
    case '<': return value < num;
    case '>=': return value >= num;
    case '<=': return value <= num;
    case '=': return value === num;
    default: return false;
  }
}

/**
 * Get visual styling for segments based on mode and selection state
 */
export function getSegmentStyle(segment, isSelected, mode, evaluation = null) {
  const baseStyle = {
    cursor: mode === 'self_check' ? 'default' : 'pointer',
    display: 'inline',
    borderRadius: '2px',
    padding: '0 2px'
  };

  if (mode === 'self_check') {
    // In self-check mode, show the answer
    if (segment.type === 'required') {
      return { ...baseStyle, backgroundColor: '#c3f0c3', fontWeight: 'bold' };
    } else if (segment.type === 'optional') {
      return { ...baseStyle, backgroundColor: '#fff3cd' };
    } else if (segment.type === 'feedback_trigger') {
      return { ...baseStyle, backgroundColor: '#f8d7da' };
    }
  } else if (mode === 'immediate') {
    // In immediate mode, show feedback colors
    if (!isSelected) return baseStyle;

    if (segment.type === 'required') {
      return { ...baseStyle, backgroundColor: '#d4edda', border: '1px solid #28a745' };
    } else if (segment.type === 'optional') {
      return { ...baseStyle, backgroundColor: '#fff3cd', border: '1px solid #ffc107' };
    } else if (segment.type === 'feedback_trigger' || segment.type === 'text') {
      return { ...baseStyle, backgroundColor: '#f8d7da', border: '1px solid #dc3545' };
    }
  } else {
    // Graded mode - just show selection
    if (isSelected) {
      return { ...baseStyle, backgroundColor: '#e3f2fd', border: '1px solid #2196f3' };
    }
  }

  return baseStyle;
}