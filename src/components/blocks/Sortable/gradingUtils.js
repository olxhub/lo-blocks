// src/components/blocks/Sortable/gradingUtils.js

/**
 * Grade a sortable arrangement using various algorithms
 * @param {string[]} arrangement - Current arrangement of item IDs
 * @param {SortableItem[]} items - Items with correct positions
 * @param {GradingConfig} config - Grading configuration
 * @returns {GradingResult} Grading result with score and feedback
 */
export function gradeArrangement(arrangement, items, config = {}) {
  const { algorithm = 'exact', partialCredit = false } = config;

  // Create lookup map for correct positions
  const correctPositions = {};
  items.forEach(item => {
    correctPositions[item.id] = item.correctIndex;
  });

  switch (algorithm) {
    case 'exact':
      return gradeExact(arrangement, correctPositions);
    
    case 'partial':
      return gradePartial(arrangement, correctPositions, partialCredit);
    
    case 'adjacent':
      return gradeAdjacent(arrangement, correctPositions);
    
    case 'spearman':
      return gradeSpearman(arrangement, correctPositions);
    
    default:
      throw new Error(`Unknown grading algorithm: ${algorithm}`);
  }
}

/**
 * Exact match grading - all or nothing
 */
function gradeExact(arrangement, correctPositions) {
  const isCorrect = arrangement.every((itemId, index) => {
    const correctPos = correctPositions[itemId];
    return correctPos === index + 1; // Convert to 1-indexed
  });

  return {
    score: isCorrect ? 1.0 : 0.0,
    isCorrect,
    feedback: isCorrect 
      ? 'Perfect! All items are in the correct order.'
      : 'Not quite right. Check the order and try again.'
  };
}

/**
 * Partial credit grading - points for each correct position
 */
function gradePartial(arrangement, correctPositions, allowPartialCredit = true) {
  let correctCount = 0;
  const total = arrangement.length;
  
  arrangement.forEach((itemId, index) => {
    const correctPos = correctPositions[itemId];
    if (correctPos === index + 1) {
      correctCount++;
    }
  });

  const score = total > 0 ? correctCount / total : 0;
  const isCorrect = score === 1.0;

  let feedback;
  if (isCorrect) {
    feedback = 'Perfect! All items are in the correct order.';
  } else if (allowPartialCredit) {
    feedback = `${correctCount} out of ${total} items are in the correct position.`;
  } else {
    feedback = 'Not quite right. Check the order and try again.';
  }

  return {
    score: allowPartialCredit ? score : (isCorrect ? 1.0 : 0.0),
    isCorrect,
    feedback
  };
}

/**
 * Adjacent pairs grading - credit for correct adjacent relationships
 */
function gradeAdjacent(arrangement, correctPositions) {
  if (arrangement.length < 2) {
    return gradeExact(arrangement, correctPositions);
  }

  let correctPairs = 0;
  let totalPairs = arrangement.length - 1;

  for (let i = 0; i < arrangement.length - 1; i++) {
    const currentId = arrangement[i];
    const nextId = arrangement[i + 1];
    
    const currentCorrect = correctPositions[currentId];
    const nextCorrect = correctPositions[nextId];
    
    // Check if this pair is in correct relative order
    if (currentCorrect < nextCorrect) {
      correctPairs++;
    }
  }

  const score = totalPairs > 0 ? correctPairs / totalPairs : 1;
  const isCorrect = score === 1.0;

  return {
    score,
    isCorrect,
    feedback: isCorrect 
      ? 'Perfect! All adjacent relationships are correct.'
      : `${correctPairs} out of ${totalPairs} adjacent pairs are in correct order.`
  };
}

/**
 * Spearman correlation grading - measures rank correlation
 */
function gradeSpearman(arrangement, correctPositions) {
  const n = arrangement.length;
  if (n < 2) {
    return gradeExact(arrangement, correctPositions);
  }

  // Calculate rank differences
  let sumSquaredDifferences = 0;
  
  arrangement.forEach((itemId, index) => {
    const actualRank = index + 1;
    const correctRank = correctPositions[itemId];
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
    isCorrect,
    feedback: isCorrect 
      ? 'Excellent! The order shows strong correlation with the correct answer.'
      : `The order shows ${Math.round(spearman * 100)}% correlation with the correct answer.`
  };
}