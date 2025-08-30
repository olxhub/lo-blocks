// src/components/blocks/Sortable/sortable.test.js

import { describe, it, expect } from 'vitest';
import { parseSortableContent } from './sortableUtils';
import { gradeArrangement } from './gradingUtils';

describe('Sortable Parser', () => {
  it('should parse basic planet example', () => {
    const input = `Sort the planets from the sun
=============================
3. Earth
4. Mars  
1. Mercury
2. Venus`;

    const result = parseSortableContent(input);
    
    expect(result.prompt).toBe('Sort the planets from the sun');
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toEqual({
      id: 'item_3',
      content: 'Earth',
      correctIndex: 3
    });
    expect(result.items[1]).toEqual({
      id: 'item_4', 
      content: 'Mars',
      correctIndex: 4
    });
  });

  it('should handle empty lines and whitespace', () => {
    const input = `Sort numbers
============
1. One

3. Three

2. Two`;

    const result = parseSortableContent(input);
    expect(result.items).toHaveLength(3);
    expect(result.items.map(i => i.content)).toEqual(['One', 'Three', 'Two']);
  });
});

describe('Sortable Grading', () => {
  const items = [
    { id: 'a', correctIndex: 1 },
    { id: 'b', correctIndex: 2 },
    { id: 'c', correctIndex: 3 },
    { id: 'd', correctIndex: 4 }
  ];

  it('should grade perfect arrangement as 100%', () => {
    const arrangement = ['a', 'b', 'c', 'd'];
    const result = gradeArrangement(arrangement, items, { algorithm: 'exact' });
    
    expect(result.score).toBe(1.0);
    expect(result.isCorrect).toBe(true);
    expect(result.feedback).toContain('Perfect');
  });

  it('should grade completely wrong as 0%', () => {
    const arrangement = ['d', 'c', 'b', 'a'];
    const result = gradeArrangement(arrangement, items, { algorithm: 'exact' });
    
    expect(result.score).toBe(0);
    expect(result.isCorrect).toBe(false);
  });

  it('should give partial credit for partial algorithm', () => {
    const arrangement = ['a', 'c', 'b', 'd']; // 2 out of 4 correct
    const result = gradeArrangement(arrangement, items, { 
      algorithm: 'partial',
      partialCredit: true 
    });
    
    expect(result.score).toBe(0.5);
    expect(result.isCorrect).toBe(false);
  });
});