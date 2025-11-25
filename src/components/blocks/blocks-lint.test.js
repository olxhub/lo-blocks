/**
 * Lint-style tests for block components.
 *
 * Rule 1: Use useReduxState instead of useState
 *
 * Block components should use useReduxState (or useReduxInput, useReduxCheckbox)
 * so that state is persisted and logged. React's useState creates ephemeral state
 * that's lost on re-render and isn't visible to analytics.
 *
 * If useState is genuinely needed for transient UI state (e.g., drag-and-drop),
 * add a comment on the line before:
 *
 *   // useState-ok: drag state doesn't need persistence
 *   const [dragging, setDragging] = useState(false);
 *
 * Rule 2: No JSX in blueprint files (.js)
 *
 * Blocks should be split into two files:
 *   - Name.js   - Blueprint file (block definition, no JSX, works server-side)
 *   - _Name.jsx - Component file (React component with JSX, client-side)
 *
 * This separation allows blueprints to be imported server-side without pulling
 * in React/JSX dependencies. If a .js file contains JSX, it will fail when
 * imported by server-side scripts like xml2json.
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { relative } from 'path';
import { generateAllRegistryContents } from '@/scripts/generateRegistry.js';

const BLOCKS_DIR = __dirname;

function findComponentFiles() {
  return globSync('**/*.{jsx,tsx}', {
    cwd: BLOCKS_DIR,
    absolute: true,
    ignore: '**/*.test.*'
  });
}

function isExempted(lines, lineIndex) {
  const line = lines[lineIndex];

  // Check current line for inline exemption
  if (line.includes('useState-ok')) return true;

  // Check previous lines for exemption comment covering consecutive useState calls
  for (let i = lineIndex - 1; i >= 0; i--) {
    const prev = lines[i].trim();
    if (prev.includes('useState-ok')) return true;
    if (prev.includes('useState(')) continue;  // Keep looking past other useState lines
    if (prev && !prev.startsWith('//')) break; // Stop at non-comment code
  }

  return false;
}

function findUseStateViolations(filePath) {
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('import ')) return;
    if (!line.includes('useState(')) return;
    if (isExempted(lines, index)) return;

    violations.push({ line: index + 1, content: line.trim() });
  });

  return violations;
}

describe('Block components should use useReduxState instead of useState', () => {
  const files = findComponentFiles();

  it('finds component files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach(filePath => {
    const name = relative(BLOCKS_DIR, filePath);

    it(name, () => {
      const violations = findUseStateViolations(filePath);
      if (violations.length === 0) return;

      const details = violations.map(v => `  Line ${v.line}: ${v.content}`).join('\n');
      expect.fail(
        `Found useState that should be useReduxState:\n${details}\n\n` +
        `To exempt, add a comment: // useState-ok: <reason>`
      );
    });
  });
});


/*
  We are checking if a blueprint file accidentally contains JSX. This
  test uses regexps, and is a bit brittle. It's fine to remove if it
  causes problems. It's important during the migration, but in due
  course, we will deprecate .jsx/.tsx files.

  Really, we should just be checking for importing react later.
 */
function findJSXInFile(filePath) {
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track block comments
    if (trimmed.includes('/*')) inBlockComment = true;
    if (trimmed.includes('*/')) { inBlockComment = false; continue; }
    if (inBlockComment) continue;

    // Skip line comments
    if (trimmed.startsWith('//')) continue;

    // Look for JSX: < followed by uppercase (component) or lowercase (html tag)
    const jsxMatch = line.match(/<[A-Za-z]/);
    if (!jsxMatch) continue;

    // Make sure it's not inside a line comment
    const commentIndex = line.indexOf('//');
    if (commentIndex !== -1 && jsxMatch.index > commentIndex) continue;

    // Make sure it's not inside a string or template literal
    const beforeMatch = line.slice(0, jsxMatch.index);
    const quotes = (beforeMatch.match(/[`'"]/g) || []).length;
    if (quotes % 2 === 1) continue; // Inside a string

    return { line: i + 1, content: trimmed };
  }

  return null;
}

describe('Blueprint files should not contain JSX', () => {
  const { blocks } = generateAllRegistryContents();

  it('finds blueprint files to check', () => {
    expect(blocks.files.length).toBeGreaterThan(0);
  });

  blocks.files.forEach(filePath => {
    const name = relative(process.cwd(), filePath);

    it(name, () => {
      const ext = filePath.match(/\.[^.]+$/)[0];

      // Blueprint files should use .js/.ts, not .jsx/.tsx
      if (ext === '.jsx' || ext === '.tsx') {
        expect.fail(
          `Blueprint should use ${ext.replace('x', '')} extension, not ${ext}\n\n` +
          `Rename to ${ext.replace('x', '')} and move any JSX to a _Component${ext} file.`
        );
      }

      const violation = findJSXInFile(filePath);
      if (!violation) return;

      expect.fail(
        `Blueprint contains JSX at line ${violation.line}:\n` +
        `  ${violation.content}\n\n` +
        `Move JSX to a _Component.jsx file and import it.`
      );
    });
  });
});
