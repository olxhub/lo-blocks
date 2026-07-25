// @vitest-environment node
/**
 * Staleness tests for generated files.
 *
 * These tests catch a common source of confusing bugs: forgetting to
 * regenerate files after changing sources or switching branches.
 *
 * If a test fails:
 *   npm run build           # regenerate everything
 *   npm run build:grammars  # just grammars
 *   npm run build:gen-block-registry  # just registries
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { generateAllRegistryContents } from './generateBlockRegistry';

// The raw failures below (content differs, parser outdated, etc.) are
// unactionable on their own — a developer seeing them has no idea the cause
// is a missing build step. This message spells out the one-line fix so the
// failure explains itself.
const BUILD_HINT =
  'This failure just means you forgot to run `npm run build`. This is often\n' +
  'necessary when e.g. switching branches. It rebuilds the block registry,\n' +
  'registers changed documentation, regenerates grammar parsers, etc.';

describe('Generated files should be up-to-date', () => {

  it('block and CSS registries match source files', () => {
    const registries = generateAllRegistryContents();
    const stale = [];

    for (const [name, { content: expected, outputFile }] of Object.entries(registries)) {
      if (!existsSync(outputFile)) {
        stale.push(`${name}: file missing (${outputFile})`);
        continue;
      }
      if (readFileSync(outputFile, 'utf-8') !== expected) {
        stale.push(`${name}: content differs (${outputFile})`);
      }
    }

    if (stale.length > 0) {
      expect.fail(
        `Stale registries:\n  ${stale.join('\n  ')}\n\n` +
        `${BUILD_HINT}\n\n` +
        `Run: npm run build:gen-block-registry`
      );
    }
  });

  it('grammar parsers are newer than their .pegjs sources', () => {
    const grammars = globSync('packages/shared/**/*.pegjs');
    const stale = [];

    for (const grammar of grammars) {
      const parser = path.join(
        path.dirname(grammar),
        `_${path.basename(grammar, '.pegjs')}Parser.js`
      );

      if (!existsSync(parser)) {
        stale.push(`${grammar} → missing parser`);
        continue;
      }

      const grammarMtime = statSync(grammar).mtimeMs;
      const parserMtime = statSync(parser).mtimeMs;

      if (grammarMtime > parserMtime) {
        stale.push(`${grammar} → parser outdated`);
      }
    }

    if (stale.length > 0) {
      expect.fail(
        `Stale grammar parsers:\n  ${stale.join('\n  ')}\n\n` +
        `${BUILD_HINT}\n\n` +
        `Run: npm run build:grammars`
      );
    }
  });

});
