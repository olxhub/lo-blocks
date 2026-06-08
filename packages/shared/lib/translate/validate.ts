// packages/shared/lib/translate/validate.ts
//
// Validation for translated content. Ensures the output is well-formed
// and structurally matches the source before it gets saved.

import { parseOLX } from '@/lib/content/parseOLX';
import type { LofsRef } from '@/lib/types/address';
import { toLofsRef } from '@/lib/types/address';
import type { StorageProvider } from '@/lib/types/storage';
import { getParserForExtension } from '@/generated/parserRegistry';
import { extractLeadingComments } from '@/lib/translate/metadata';

/** Validate translated content against its source.
 *  Returns null on success, or an error message describing the problem.
 *  If provider + sourceProvenance are supplied, src= attributes can be resolved. */
export async function validateTranslation(
  translatedContent: string,
  sourceContent: string,
  fileType: string,
  label: string,
  provider?: StorageProvider,
  sourceProvenance?: LofsRef[]
): Promise<string | null> {
  if (fileType === 'olx') {
    return validateOlx(translatedContent, sourceContent, label, provider, sourceProvenance);
  }
  // PEG-based formats: validate by parsing with the compiled grammar
  const parser = getParserForExtension(fileType);
  if (parser) {
    return validatePeg(translatedContent, parser, label);
  }
  // Unknown file type — skip validation
  return null;
}

async function validateOlx(
  translatedContent: string,
  sourceContent: string,
  label: string,
  provider?: StorageProvider,
  sourceProvenance?: LofsRef[]
): Promise<string | null> {
  // Parse the translated output. Use source provenance so src= paths resolve
  // correctly (translated file lives next to source, same relative paths).
  const provenance = sourceProvenance || [toLofsRef(`translation:${label}`)];
  let translatedResult;
  try {
    translatedResult = await parseOLX(translatedContent, provenance, provider);
  } catch (err: any) {
    return `Translated OLX failed to parse: ${err.message}`;
  }

  if (translatedResult.errors.length > 0) {
    const titles = translatedResult.errors.map((e: any) => e.title || e.message).join('; ');
    return `Translated OLX has errors: ${titles}`;
  }

  // Compare explicit IDs: every author-specified id in the source must appear
  // in the translation. Auto-generated IDs (prefixed with "_") are content-
  // dependent SHA1 hashes that will naturally differ after translation.
  let sourceResult;
  try {
    sourceResult = await parseOLX(sourceContent, [toLofsRef('source')], provider);
  } catch {
    // If the source itself doesn't parse, skip the ID comparison —
    // that's a pre-existing problem, not a translation problem.
    return null;
  }

  const isExplicitId = (id: string) => !id.startsWith('_');
  const translatedIds = new Set(translatedResult.ids.filter(isExplicitId));
  const missingIds = sourceResult.ids.filter((id: string) => isExplicitId(id) && !translatedIds.has(id));
  if (missingIds.length > 0) {
    return `Translation is missing ${missingIds.length} block(s): ${missingIds.join(', ')}`;
  }

  return null;
}

function validatePeg(
  translatedContent: string,
  parser: { parse: (input: string) => unknown },
  label: string
): string | null {
  // Strip frontmatter (<!-- --- ... --- -->) before parsing — PEG grammars don't understand it
  let { body } = extractLeadingComments(translatedContent);
  // PEG grammars typically require every line to end with a newline
  if (body.length > 0 && !body.endsWith('\n')) body += '\n';

  try {
    parser.parse(body);
  } catch (err: any) {
    const location = err.location
      ? ` at line ${err.location.start.line}, column ${err.location.start.column}`
      : '';
    return `Translated PEG content failed to parse${location}: ${err.message}`;
  }

  return null;
}
