/**
 * Lint-style tests for block components.
 *
 * Rule: Use useReduxState instead of useState
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
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { relative } from 'path';

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
