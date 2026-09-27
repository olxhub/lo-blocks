// Does every .olx that carries {{corpus:...}} say where its corpus data lives?
//
// Ported from `enforcement.check_every_reference_has_the_data_that_resolves_it`
// (goal K). Python fetches the .olx files -- it knows where the tree is -- and
// the judgement lives here.
//
// THIS PORT REMOVES A COPY, WHICH IS THE POINT. The python check carried the
// build's rule transcribed by hand, under a comment reading "THE BUILD'S OWN
// RULE, COPIED EXACTLY": `olx.slice(0, 4000)` and
// `/^\s*corpus_data:\s*(\S+)\s*$/m`. A transcription stays correct only while
// someone keeps it in step, and this one had ALREADY BEEN WRONG once -- it
// asked for a `---` fence at byte 0, every .olx in the tree wraps its
// frontmatter in an HTML comment, and all fifteen reference-carrying files
// reported missing data, including three that plainly carried it.
//
// So this calls `corpusDataPath` ITSELF. The check can no longer disagree with
// the thing it predicts, because it is now asking it.
//
// WHY A THROW COUNTS AS PRESENT. `corpusDataPath` expands `$VARS` and throws
// when one is unset -- but it only reaches the expansion AFTER matching, so a
// throw proves the line was there. Presence is `non-null OR threw`, which is
// exactly what the python regex tested. Treating a throw as absence would
// report a file that declares its data as one that does not.

import { corpusDataPath } from '../../../scripts/resolveCorpusRefs';

/** One .olx as python read it. */
export type OlxFile = {
  /** Display path, relative to the tree root, as the finding should name it. */
  path: string;
  /** The file's text, or absent when python could not read it. */
  text?: string;
  /** Set when the file could not be read. */
  error?: string;
};

export type ReferenceDataPayload = {
  files: OlxFile[];
  /** The directory python scanned, so an empty scan can say what it covered. */
  root?: string;
};

/** Does this .olx declare its corpus data, by the BUILD's rule? */
export function declaresCorpusData(olx: string): boolean {
  try {
    return corpusDataPath(olx) !== null;
  } catch {
    return true;     // it matched, then failed to expand -- see above
  }
}

/**
 * Every reference-carrying .olx that does not declare its corpus data.
 *
 * AN EMPTY SCAN IS NOT AGREEMENT. If no files were supplied the caller looked
 * at nothing, and that is reported rather than returned as clean -- the same
 * discipline the rest of this package applies to a rule that could not run.
 */
export function everyReferenceHasItsData(p: ReferenceDataPayload): string[] {
  const files = p?.files ?? [];
  if (!files.length) {
    return [`no .olx found under ${p?.root ?? 'the content tree'}; the scan `
          + `covered nothing, which cannot be reported as agreement`];
  }
  const out: string[] = [];
  for (const f of files) {
    if (f.error !== undefined && f.error !== null) {
      out.push(`${f.path}: cannot be read (${f.error}), so whether its `
             + `references resolve is unknown`);
      continue;
    }
    const text = String(f.text ?? '');
    if (!text.includes('{{corpus:')) continue;
    if (declaresCorpusData(text)) continue;
    const n = text.split('{{corpus:').length - 1;
    out.push(`${f.path}: carries ${n} reference(s) `
           + `but no \`corpus_data:\` in its frontmatter -- the content `
           + `build refuses this file, and with it the whole build`);
  }
  return out;
}
