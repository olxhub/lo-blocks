// src/lib/content/stripIndent.test.js
import { stripIndent } from './stripIndent.js';

describe('stripIndent', () => {
  test('strips common leading whitespace', () => {
    const input = `        # Learning Observer Components

        Learning Observer supports many different types of interactive components:

        - **Markdown**: For rich markdown content
        - **TextArea**: For student input`;

    const expected = `# Learning Observer Components

Learning Observer supports many different types of interactive components:

- **Markdown**: For rich markdown content
- **TextArea**: For student input`;

    expect(stripIndent(input)).toBe(expected);
  });

  test('handles tabs and spaces', () => {
    const input = `    # Header
    Content with 4 spaces
    Content with 4 spaces too`;

    const expected = `# Header
Content with 4 spaces
Content with 4 spaces too`;

    expect(stripIndent(input)).toBe(expected);
  });

  test('removes leading and trailing empty lines', () => {
    const input = `

      Content
      More content

`;

    const expected = `Content
More content`;

    expect(stripIndent(input)).toBe(expected);
  });

  test('handles empty string', () => {
    expect(stripIndent('')).toBe('');
  });

  test('handles string with only whitespace', () => {
    expect(stripIndent('   \n  \n   ')).toBe('');
  });

  test('throws error for non-string input', () => {
    expect(() => stripIndent(null)).toThrow('stripIndent expects a string input');
    expect(() => stripIndent(123)).toThrow('stripIndent expects a string input');
  });
});