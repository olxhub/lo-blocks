// packages/shared/components/blocks/_test/BadBlock.ts
//
// Internal test block that deliberately fails, so we can exercise — and, in the
// test suite, PROVE we actually detect — the error pipeline end to end:
//
//   - parse-time exceptions   (fatal: parseOLX rejects → setFatalError + onError)
//   - parse-time warnings      (non-fatal: collected into result.errors / the
//                               warnings panel; block still renders)
//   - render-time exceptions   (real app: RenderOLX's ErrorBoundary →
//                               DisplayError + render-error ErrorNode)
//
// Pairs with the BadBlock*.olx fixtures and the canary assertions in
// demo-render.test.ts that confirm each failure mode actually surfaces (a bad
// test that silently passes when rendering breaks is itself a bug).
//
import { z } from 'zod';
import { test } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import { z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import type { OLXLoadingError } from '@/lib/types/errors';
import { _BadBlock } from './_BadBlock';

// throws: when (if ever) to blow up.  kind: what to throw.
//   kind="native"    → new Error(message)             (well-formed)
//   kind="apperror"  → AppError-shaped object throw    (no native stack)
//   kind="undefined" → call an undefined member        (raw TypeError)
// warn: also push a non-fatal parse-time warning (independent of throws).
const attributes = z.object({
  throws: z.enum(['none', 'parse', 'render']).default('render'),
  kind: z.enum(['native', 'apperror', 'undefined']).default('native'),
  warn: z_olx_boolean.optional(),
  message: z.string().optional(),
}).strict();

// Custom parser: optionally emits a parse-time warning, then optionally throws
// at parse time. Otherwise it stores a normal (childless) entry so the render
// path runs — and, for throws="render", fails there instead.
const buggyParser = childParser(async function buggyParser(ctx: any) {
  const { attributes: attrs = {}, provenance, errors } = ctx;
  const { throws = 'render', kind = 'native', warn, message } = attrs;
  const msg = typeof message === 'string' && message
    ? message
    : `BadBlock: deliberate parse-time ${throws === 'parse' ? 'failure' : 'warning'}`;

  if (warn) {
    // Non-fatal: collected into result.errors and shown in the warnings panel,
    // like a recoverable authoring problem. Typed as our canonical parse-error
    // shape so it's enforced, not a stray object literal.
    const warning: OLXLoadingError = {
      type: 'attribute_validation',
      title: 'BadBlock parse-time warning',
      message: msg,
      location: { provenance },
      technical: { kind, synthetic: true },
    };
    errors.push(warning);
  }

  if (throws === 'parse') {
    if (kind === 'undefined') {
      // Raw TypeError — the unexpected-failure path.
      (undefined as any).parseBoom();
    }
    if (kind === 'apperror') {
      // Throw our canonical parse-error shape, typed (not a stray literal).
      const parseError: OLXLoadingError = {
        type: 'parse_error',
        title: 'BadBlock parse failure',
        message: msg,
        location: { provenance },
        technical: { kind, synthetic: true },
      };
      throw parseError;
    }
    throw new Error(msg);
  }

  return []; // no kids; childParser stores the entry + returns the id
});
buggyParser.childMode = 'none';
buggyParser.staticKids = () => [];

const BadBlock = test({
  ...buggyParser(),
  name: 'BadBlock',
  description: 'Internal test block that deliberately fails (parse/render) to exercise and verify the error-handling pipeline',
  component: _BadBlock,
  attributes,
  internal: true,
});

export default BadBlock;
