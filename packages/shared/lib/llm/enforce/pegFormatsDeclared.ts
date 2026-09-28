// The authoring formats a teacher writes in, held to the engine's own registry.
//
// Ported from `peg_formats.verify` (goal K), SPLIT AT THE OWNER BOUNDARY:
// this rule judges EXTENSIONS, which are the engine's; the ORPHANED CONTENT
// arms stay in python because they judge COURSE FILES.
//
// That split is not tidiness. `AUTHORED_AS` and `UNREGISTERED` describe
// extensions -- `.capapeg` is a grammar the engine ships, and what a teacher
// authors in it is the same statement on every course. `ORPHANED_CONTENT`
// names individual course files by basename, so putting the three in one
// payload would carry a course-specific list across on the back of two engine
// ones, and the rule would quietly become course-shaped.
//
// FOUR STATEMENTS, ALL ABOUT A FORMAT REGISTRY:
//   a REGISTERED format must say what a teacher writes in it -- the one thing
//     an intake program needs from the table;
//   a format AUTHORED_AS describes must be one the engine registers;
//   a format a COURSE USES must be registered, or it is content nothing parses;
//   a declaration that a format is unregistered must not outlive its reason,
//     in either direction -- the engine registering it now, or no course using
//     it any more.
//
// It caught `.textHighlightpeg` on its first run: three psych files in an
// extension lo-blocks registers NOWHERE, each byte-identical to a
// `.textSelectionpeg` beside it.

export type PegFormatsPayload = {
  /** Extensions the engine's `generated/parserRegistry.ts` knows. */
  registry: string[];
  /** Extensions AUTHORED_AS says what a teacher writes in. */
  authoredAs: string[];
  /** Extensions declared deliberately unregistered, with the reason recorded. */
  unregistered: string[];
  /** extension -> the course files found using it. */
  found: Record<string, string[]>;
};

// NOT COURSE CONTENT AND NOT A FORMAT QUESTION. `cast` and `liquid` are
// carried by the corpus scan and judged by neither table.
const SKIP_EXT = new Set(['cast', 'liquid']);

export function pegFormatsDeclared(p: PegFormatsPayload): string[] {
  const out: string[] = [];
  const reg = new Set(p?.registry ?? []);
  const authored = new Set(p?.authoredAs ?? []);
  const unreg = new Set(p?.unregistered ?? []);
  const found = p?.found ?? {};

  for (const ext of [...reg].sort()) {
    if (!authored.has(ext)) {
      out.push(
        `${ext} is a registered PEG format and AUTHORED_AS does not ` +
        `say what a teacher writes in it -- which is the one thing ` +
        `an intake program needs from this table`);
    }
  }
  for (const ext of [...authored].sort()) {
    if (!reg.has(ext)) {
      out.push(`AUTHORED_AS describes ${ext}, which the engine's registry ` +
               `does not know`);
    }
  }
  for (const ext of Object.keys(found).sort()) {
    const files = found[ext] ?? [];
    if (SKIP_EXT.has(ext)) continue;
    if (!reg.has(ext) && !unreg.has(ext)) {
      out.push(`.${ext} is used by ${files.length} course file(s) ` +
               `(${files[0]}) and is registered by NO grammar -- say what ` +
               `it is, or it is content nothing can parse`);
    }
  }
  for (const ext of [...unreg].sort()) {
    if (reg.has(ext)) {
      out.push(`${ext} is declared unregistered but the engine registers ` +
               `it now -- the declaration has outlived its reason`);
    }
    if (!(ext in found)) {
      out.push(`${ext} is declared unregistered and no course uses it any ` +
               `more -- drop the entry`);
    }
  }
  return out;
}
