/**
 * Manual test for shuffle.ts
 *
 * Since Fisher-Yates shuffle is randomized, we test it by:
 * 1. Running it multiple times with output
 * 2. Verifying the key behaviors visually
 *
 * Expected output below shows:
 * - Without fixed positions: items shuffle differently on each run
 * - With fixed positions: constrained items stay in place, others shuffle randomly
 *
 * Run with: npx tsx src/lib/utils/shuffle-manual-test.ts
 */

import { buildArrangementWithPositions } from './shuffle';

const items = [
  { id: 'apple', val: '🍎' },
  { id: 'banana', val: '🍌' },
  { id: 'cherry', val: '🍒' },
  { id: 'date', val: '📅' },
  { id: 'elderberry', val: '🫐' },
];

console.log('Original order:');
items.forEach((item, i) => console.log(`  ${i + 1}. ${item.id}`));

console.log('\n--- Shuffles without fixed positions ---');
for (let run = 1; run <= 3; run++) {
  const result = buildArrangementWithPositions(items, {
    idSelector: (item) => item.id,
    positionSelector: () => undefined,
    shouldShuffleUnpositioned: true,
  });
  if ('error' in result) {
    console.error('Error:', result.error.message);
    continue;
  }
  console.log(`\nRun ${run}:`);
  result.arrangement.forEach((item, i) => console.log(`  ${i + 1}. ${item.id}`));
}

console.log('\n--- Shuffles with fixed positions (apple at 2, cherry at 5) ---');
for (let run = 1; run <= 3; run++) {
  const result = buildArrangementWithPositions(items, {
    idSelector: (item) => item.id,
    positionSelector: (item) => {
      if (item.id === 'apple') return 2;
      if (item.id === 'cherry') return 5;
      return undefined;
    },
    shouldShuffleUnpositioned: true,
  });
  if ('error' in result) {
    console.error('Error:', result.error.message);
    continue;
  }
  console.log(`\nRun ${run}:`);
  result.arrangement.forEach((item, i) => {
    const marker = item.id === 'apple' || item.id === 'cherry' ? ' [FIXED]' : '';
    console.log(`  ${i + 1}. ${item.id}${marker}`);
  });
}

/*
EXPECTED OUTPUT:

Original order:
  1. apple
  2. banana
  3. cherry
  4. date
  5. elderberry

--- Shuffles without fixed positions ---

Run 1:
  1. banana
  2. cherry
  3. elderberry
  4. date
  5. apple

Run 2:
  1. elderberry
  2. date
  3. apple
  4. cherry
  5. banana

Run 3:
  1. banana
  2. cherry
  3. date
  4. elderberry
  5. apple

--- Shuffles with fixed positions (apple at 2, cherry at 5) ---

Run 1:
  1. date
  2. apple [FIXED]
  3. elderberry
  4. banana
  5. cherry [FIXED]

Run 2:
  1. elderberry
  2. apple [FIXED]
  3. date
  4. banana
  5. cherry [FIXED]

Run 3:
  1. banana
  2. apple [FIXED]
  3. date
  4. elderberry
  5. cherry [FIXED]
*/
