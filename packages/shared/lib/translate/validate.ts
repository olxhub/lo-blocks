// src/lib/translate/validate.ts
//
// Validation for translated content. Ensures the output is well-formed
// and structurally matches the source before it gets saved.

import { parseOLX } from '@/lib/content/parseOLX';
import type { Provenance } from '@/lib/types';
import { getParserForExtension } from '@/generated/parserRegistry';
import { extractLeadingComments } from '@/lib/translate/metadata';

/** Validate translated content against its source.
 *  Returns null on success, or an error message describing the problem. */
export async function validateTranslation(
  translatedContent: string,
  sourceContent: string,
  fileType: string,
  label: string
): Promise<string | null> {
  if (fileType === 'olx') {
    return validateOlx(translatedContent, sourceContent, label);
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
  label: string
): Promise<string | null> {
  // Parse the translated output
  let translatedResult;
  try {
    translatedResult = await parseOLX(translatedContent, [`translation:${label}`] as Provenance);
  } catch (err: any) {
    return `Translated OLX failed to parse: ${err.message}`;
  }

  if (translatedResult.errors.length > 0) {
    const summaries = translatedResult.errors.map((e: any) => e.summary || e.message).join('; ');
    return `Translated OLX has errors: ${summaries}`;
  }

  // Compare IDs: every explicit id in the source must appear in the translation
  let sourceResult;
  try {
    sourceResult = await parseOLX(sourceContent, ['source'] as Provenance);
  } catch {
    // If the source itself doesn't parse, skip the ID comparison —
    // that's a pre-existing problem, not a translation problem.
    return null;
  }

  const translatedIds = new Set(translatedResult.ids);
  const missingIds = sourceResult.ids.filter((id: string) => !translatedIds.has(id));
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
  const { body } = extractLeadingComments(translatedContent);

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
