import { compile, extractPlaceholders, render, validate } from './template';

import { describe, it, expect } from 'vitest';

describe('template end-to-end', () => {
  it('should compile, extract, render, and validate a template', () => {
    const template = '<h2>{{subtitle}}</h2><p>{{prompt}}</p>';
    const ast = compile(template);

    // Extract
    const placeholders = extractPlaceholders(ast);
    expect(placeholders).toEqual(['subtitle', 'prompt']);

    // Render correct
    const values = { subtitle: 'LLMs and Writing', prompt: 'Describe how LLMs are changing writing.' };
    expect(render(ast, values)).toBe('<h2>LLMs and Writing</h2><p>Describe how LLMs are changing writing.</p>');

    // Render missing
    expect(render(ast, { subtitle: 'Test' })).toBe('<h2>Test</h2><p></p>');

    // Validate
    expect(validate(ast, values)).toEqual({ valid: true, missing: [], extra: [] });
    expect(validate(ast, { subtitle: 'Only' })).toEqual({ valid: false, missing: ['prompt'], extra: [] });
    expect(validate(ast, { subtitle: 'A', prompt: 'B', extra: 'X' })).toEqual({ valid: false, missing: [], extra: ['extra'] });
  });
});
