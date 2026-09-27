// A composed document that no longer matches what composing would produce.
//
// Ported from `enforcement.check_composed_documents_are_current` (goal K),
// which delegates to `compose_docs.stale`.
//
// READERS OPEN THE COMPOSED COPY. A stale one is prose nobody is editing: the
// halves have moved on and every reader is still being shown the old text.
// Nothing else reports it, because a stale document parses perfectly.
//
// AND ONE THAT WAS NEVER COMPOSED IS THE SAME FAILURE on a fresh checkout --
// readers open a file that does not exist, and a reader that cannot find a
// document reports an empty record rather than an error.

import { composeDocument, ComposeRefused } from './composeDocument';

export type ComposedCurrencyPayload = {
  docs: Array<{
    name: string;
    generic: string;
    specific: string;
    composedPath: string;
    /** null when it has never been composed. */
    composed: string | null;
  }>;
};

export function composedDocumentsCurrent(p: ComposedCurrencyPayload): string[] {
  const out: string[] = [];
  for (const d of p.docs ?? []) {
    if (d.composed === null) {
      out.push(
        `${d.name} has never been composed (${d.composedPath}); run ` +
        `\`python3 compose_docs.py --build\`. Readers open the composed copy, ` +
        `so an unbuilt one is a document that does not exist`);
      continue;
    }
    let want: string;
    try {
      want = composeDocument(d.name, d.generic, d.specific);
    } catch (e) {
      // A REFUSAL IS NOT A PASS. Composition that cannot run says so; reporting
      // it as "current" would certify a document nobody can rebuild.
      out.push(e instanceof ComposeRefused ? String(e.message)
                                           : `${d.name} could not be composed: ${String(e)}`);
      continue;
    }
    if (d.composed !== want) {
      out.push(
        `${d.name} was composed from sources that have since changed -- the ` +
        `composed copy is stale, and every reader is reading prose nobody is ` +
        `editing. Rebuild it`);
    }
  }
  return out;
}
