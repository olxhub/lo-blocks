// src/components/blocks/Sortable/gradingUtils.js

/**
 * Grade a sortable arrangement
 *
 * Called by the grader framework with (props, params)
 * where params.input contains the arrangement from SortableInput.
 *
 * The correct order is always [0,1,2,3...] representing the XML order.
 * Items should be arranged to match their order in the XML source.
 *
 * @param {Object} props - Grader props including algorithm and partialCredit
 * @param {Object} params - Grader params containing input from SortableInput
 * @returns {Object} - { correct: boolean, message: string, score: number }
 */
export function gradeArrangement(props, params) {
  const { input } = params as { input: any };
  const { algorithm = 'exact', partialCredit = false } = props;

  // Extract the actual arrangement array from the input object
  const arrangement = input?.arrangement || [];

  // The correct order is always [0,1,2,3...] - the XML order
  const correctOrder = Array.from({ length: arrangement.length }, (_, i) => i);

  switch (algorithm) {
    case 'exact':
      return gradeExact(arrangement, correctOrder);

    case 'partial':
      return gradePartial(arrangement, correctOrder, partialCredit);

    case 'adjacent':
      return gradeAdjacent(arrangement, correctOrder);

    case 'spearman':
      return gradeSpearman(arrangement, correctOrder);

    case 'survey':
      return gradeSurvey()

    default:
      return gradeExact(arrangement, correctOrder);
  }
}

/**
 * Survey grading - all orders are correct
 * @returns {Object} - Grading result
 */
function gradeSurvey() {
  return {
    score: 1.0,
    correct: true,
    message: 'Thanks for sharing your order! This activity explores different perspectives, so any arrangement is accepted.'
  };
}

/**
 * Exact match grading - all or nothing
 * @param {Array} arrangement - Current arrangement of indices
 * @param {Array} correctOrder - Expected arrangement
 * @returns {Object} - Grading result
 */
function gradeExact(arrangement, correctOrder) {
  const isCorrect = arrangement.length === correctOrder.length &&
    arrangement.every((val, index) => val === correctOrder[index]);

  return {
    score: isCorrect ? 1.0 : 0.0,
    correct: isCorrect,
    message: isCorrect
      ? 'Perfect! All items are in the correct order.'
      : 'Not quite right. Check the order and try again.'
  };
}

/**
 * Partial credit grading - points for each correct position
 * @param {Array} arrangement - Current arrangement of indices
 * @param {Array} correctOrder - Expected arrangement
 * @param {boolean} allowPartialCredit - Whether to give partial credit
 * @returns {Object} - Grading result
 */
function gradePartial(arrangement, correctOrder, allowPartialCredit = true) {
  let correctCount = 0;
  const total = arrangement.length;

  arrangement.forEach((value, index) => {
    if (value === correctOrder[index]) {
      correctCount++;
    }
  });

  const score = total > 0 ? correctCount / total : 0;
  const isCorrect = score === 1.0;

  let message;
  if (isCorrect) {
    message = 'Perfect! All items are in the correct order.';
  } else if (allowPartialCredit) {
    message = `${correctCount} out of ${total} items are in the correct position.`;
  } else {
    message = 'Not quite right. Check the order and try again.';
  }

  return {
    score: allowPartialCredit ? score : (isCorrect ? 1.0 : 0.0),
    correct: isCorrect,
    message
  };
}

/**
 * Adjacent pairs grading - credit for correct adjacent relationships
 * @param {Array} arrangement - Current arrangement of indices
 * @param {Array} correctOrder - Expected arrangement
 * @returns {Object} - Grading result
 */
function gradeAdjacent(arrangement, correctOrder) {
  if (arrangement.length < 2) {
    return gradeExact(arrangement, correctOrder);
  }

  let correctPairs = 0;
  let totalPairs = arrangement.length - 1;

  for (let i = 0; i < arrangement.length - 1; i++) {
    const currentVal = arrangement[i];
    const nextVal = arrangement[i + 1];

    // Check if this pair is in correct relative order (current < next)
    if (currentVal < nextVal) {
      correctPairs++;
    }
  }

  const score = totalPairs > 0 ? correctPairs / totalPairs : 1;
  const isCorrect = score === 1.0;

  return {
    score,
    correct: isCorrect,
    message: isCorrect
      ? 'Perfect! All adjacent relationships are correct.'
      : `${correctPairs} out of ${totalPairs} adjacent pairs are in correct order.`
  };
}

/**
 * Spearman rank correlation grading
 * Measures how well the arrangement correlates with the correct order
 * @param {Array} arrangement - Current arrangement of indices
 * @param {Array} correctOrder - Expected arrangement
 * @returns {Object} - Grading result
 */
function gradeSpearman(arrangement, correctOrder) {
  const n = arrangement.length;
  if (n < 2) {
    return gradeExact(arrangement, correctOrder);
  }

  // Calculate rank differences
  let sumSquaredDifferences = 0;

  arrangement.forEach((value, index) => {
    const actualRank = index + 1;
    const correctRank = value + 1; // Convert 0-based index to 1-based rank
    const difference = actualRank - correctRank;
    sumSquaredDifferences += difference * difference;
  });

  // Spearman correlation coefficient
  const spearman = 1 - (6 * sumSquaredDifferences) / (n * (n * n - 1));

  // Convert to 0-1 scale (spearman ranges from -1 to 1)
  const score = Math.max(0, (spearman + 1) / 2);
  const isCorrect = score >= 0.95; // Nearly perfect correlation

  return {
    score,
    correct: isCorrect,
    message: isCorrect
      ? 'Excellent! The order shows strong correlation with the correct answer.'
      : `The order shows ${Math.round(spearman * 100)}% correlation with the correct answer.`
  };
}