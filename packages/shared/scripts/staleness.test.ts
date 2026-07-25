// @vitest-environment node
/**
 * Staleness tests for generated files.
 *
 * These tests catch a common source of confusing bugs: forgetting to
 * regenerate files after changing sources or switching branches. A failure here
 * is NOT a code bug and NOT a pre-existing issue — a checked-in/generated file is
 * simply out of date with its sources. The fix is always a build, never a code
 * change:
 *
 *   npm run build                     # regenerate everything (the catch-all fix)
 *   npm run build:grammars            # just the .pegjs → parser compile
 *   npm run build:parser-registry     # just the PEG parser registry
 *   npm run build:gen-block-registry  # just the block / CSS / i18n registries
 *
 * If you reached this file because a *different* test or `tsc` failed with a
 * cryptic "cannot find module .../_someParser" or a mismatched generated import,
 * that is the same class of problem wearing a disguise: run `npm run build`.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { generateAllRegistryContents } from './generateBlockRegistry';
import { generateParserRegistryContent, PARSER_REGISTRY_OUTPUT } from './generate-parser-registry';

// Every staleness failure ends with the same unambiguous framing, so no reader
// (human or LLM) mistakes an out-of-date generated file for a pre-existing bug.
const REBUILD = (specific: string) =>
  `\nThese generated file(s) are STALE — this is not a code bug or a pre-existing ` +
  `issue, a build just needs to run. Fix with:\n  ${specific}\n  npm run build   ` +
  `# or regenerate everything`;

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
      expect.fail(`Stale registries:\n  ${stale.join('\n  ')}\n` + REBUILD('npm run build:gen-block-registry'));
    }
  });

  it('PEG parser registry matches the compiled parsers on disk', async () => {
    // The registry imports every _*Parser.js by path, so a moved/removed/added
    // grammar leaves it pointing at a path that no longer exists — which shows up
    // as a "cannot find module" tsc error elsewhere, not here, unless we diff it.
    const expected = await generateParserRegistryContent();
    if (!existsSync(PARSER_REGISTRY_OUTPUT)) {
      expect.fail(`Missing ${PARSER_REGISTRY_OUTPUT}.` + REBUILD('npm run build:parser-registry'));
    }
    if (readFileSync(PARSER_REGISTRY_OUTPUT, 'utf-8') !== expected) {
      expect.fail(`Stale parser registry: ${PARSER_REGISTRY_OUTPUT}.` + REBUILD('npm run build:parser-registry'));
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
      expect.fail(`Stale grammar parsers:\n  ${stale.join('\n  ')}\n` + REBUILD('npm run build:grammars'));
    }
  });

});
