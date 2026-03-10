// src/lib/translate/prompts.ts
//
// File-type-specific translation prompts for LLM translation.

import { getLanguageLabel } from '@/lib/i18n/languages';

type Message = { role: string; content: string };

/** Build system + user messages for translating content.
 *  The system prompt varies by file type; the user message wraps the content. */
export function buildTranslationMessages(
  sourceContent: string,
  fileType: string,
  sourceLocale: string,
  targetLocale: string,
  grammar?: string
): Message[] {
  const systemPrompt = fileType === 'olx'
    ? buildOlxSystemPrompt(targetLocale)
    : buildPegSystemPrompt(targetLocale, grammar || '');

  const sourceLanguageName = getLanguageLabel(sourceLocale, 'en', 'name');
  const targetLanguageName = getLanguageLabel(targetLocale, 'en', 'name');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Translate the following content from ${sourceLanguageName} to ${targetLanguageName}:\n\n${sourceContent}` },
  ];
}

function buildOlxSystemPrompt(targetLocale: string): string {
  return `You are a translator for educational content in OLX (XML) format.

Rules for XML content:
- Translate ALL human-readable text (text between tags, attribute values like "title", "label", "placeholder", "description")
- PRESERVE all XML tags, tag names, id attributes, and structural attributes unchanged
- Do NOT translate: id values, ref values, tag names, CSS classes, LaTeX formulas, code blocks
- Maintain the exact same XML structure and nesting
- For mathematical content, preserve formulas but translate surrounding text
- Use natural, culturally appropriate phrasing

Rules for YAML metadata comments (<!-- --- ... --- -->):
- Translate "description" and "title" values
- Do NOT translate "category" — keep it unchanged
- Set "lang" to "${targetLocale}"
- Keep all other fields unchanged
- Preserve the exact <!-- --- ... --- --> comment format

Output ONLY the translated content — no explanations, no markdown fencing, no commentary.`;
}

function buildPegSystemPrompt(targetLocale: string, grammar: string): string {
  return `You are a translator for educational dialogue scripts.

The input uses a structured text format defined by the following PEG grammar:

${grammar}

Rules for translation:
- Translate dialogue text (what speakers say) and the document header values (Title, Author description, etc.)
- PRESERVE speaker names exactly as they appear
- PRESERVE all metadata syntax: [id=...], [mood=...], [class=...], [expression=...], etc.
- PRESERVE all command lines (--- waitFor: ... ---, --- pause ---, etc.)
- PRESERVE section dividers (---, ~~~~, etc.)
- PRESERVE all id values, class values, and reference arrows (->)
- PRESERVE line-level comments (# or //)
- Maintain the exact same document structure
- Use natural, culturally appropriate phrasing for dialogue
- Set the header "lang" field to "${targetLocale}" if present

Output ONLY the translated content — no explanations, no markdown fencing, no commentary.`;
}
