// The fingerprint of the APP's own schema, scoring and render code.
//
// Ported from `measured.web_code_sha` (goal K). THIS ONE IS DIFFERENT FROM THE
// OTHER PORTS: it is not a rule, it is a FUNCTION THE RECORD DEPENDS ON. Every
// artifact on disk carries a stamp this produced, and a check later compares
// that stamp against a fresh call. So the writer and the comparer must be ONE
// implementation -- which is the whole reason to move it here rather than
// reimplement it here.
//
// WHY IT BELONGS ON THIS SIDE. Everything it reads is lo-blocks' own source:
// `slotSheet.ts`, `SlotSheetGrader.ts`, `_ScoreTable.tsx`. Python was reading
// TypeScript, extracting named functions by line anchor, and brace-counting
// call sites from `scoreSlotSheet(`. That works and it is somebody else's
// language.
//
// THE HOLE IT CLOSES. The prompt fingerprint hashes the `.olx` and the scorer
// fingerprint hashes the python; NEITHER covers lo-blocks, where the schema the
// grader answers is built and the score is computed. A change to
// `buildSlotSchema` altered every web prompt in the corpus and moved no
// fingerprint at all; recorded columns went on reading `ok`.
//
// BYTE-COMPATIBILITY IS THE CONTRACT, not an aspiration. Existing stamps were
// written by the python implementation; a single character of difference in the
// normalisation makes every recorded artifact unattributable, and the checks
// that gate on attribution would report the entire corpus as uncheckable while
// appearing to run. It is verified against python on every (kind, item) before
// anything is switched to it.

import { createHash } from 'node:crypto';

/**
 * A TOP-LEVEL function's source, BY LINE ANCHOR.
 *
 * `function NAME(` at column 0, through the first line that is exactly `}`.
 *
 * NOT by brace-matching from the signature. That was the first version and it
 * silently truncated: `choices: Record<string, string[]> = {}` is a parameter
 * DEFAULT, so the matcher opened on that brace and closed on the same one,
 * returning 15 lines of signature for a 136-line function. A hash over that
 * would never move for an edit to the body -- detection that does not detect.
 * Object-literal RETURN TYPES break it the same way.
 *
 * THROWS rather than returning empty: a fingerprint that quietly covers
 * nothing is worse than one that stops the run.
 */
export function tsTopFn(src: string, name: string): string {
  const lines = src.split('\n');
  const pat = new RegExp(`^(?:export\\s+)?function\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (!pat.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '}') {
        const block = lines.slice(i, j + 1).join('\n');
        const opens = (block.match(/\{/g) ?? []).length;
        const closes = (block.match(/\}/g) ?? []).length;
        if (opens !== closes) {
          throw new Error(
            `tsTopFn('${name}'): braces unbalanced over lines ` +
            `${i + 1}-${j + 1}; the line anchor did not find the end`);
        }
        return block;
      }
    }
  }
  throw new Error(`tsTopFn: no top-level \`function ${name}\` in the source`);
}

/**
 * TypeScript with its PROSE removed.
 *
 * WHOLE-LINE `//` ONLY. An end-of-line `//` can live inside a string literal,
 * and slotSheet.ts's descriptions are instruction text sent to a grader --
 * stripping there could silently change what is hashed.
 */
export function tsBehaviour(text: string): string {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, '');
  t = t.replace(/^[ \t]*\/\/[^\n]*$/gm, '');
  return t.replace(/\s+/g, ' ').trim();
}

export type WebCodeShaPayload = {
  /** 'ask' | 'score' | 'render'. */
  kind: string;
  /** The app functions this item's answer passes through, IN ORDER. */
  names: string[];
  /** slotSheet.ts's text. */
  slotSheet: string;
  /**
   * For `score` only: the call sites belong to the scorer.
   *
   * Omitting an argument changes the score without touching a line of
   * slotSheet.ts, which is exactly the live defect -- one call site passes
   * eight of eleven parameters and loses `requires`, `forbid` and `maps`.
   * A file that cannot be read contributes `<missing NAME>`, as python does,
   * so its absence still moves the fingerprint.
   */
  callSites?: Array<{ name: string; text: string | null }>;
};

export function webCodeSha(p: WebCodeShaPayload): string {
  const parts: string[] = (p?.names ?? []).map(
    n => tsBehaviour(tsTopFn(p.slotSheet, n)));
  if (p?.kind === 'score') {
    for (const f of p.callSites ?? []) {
      if (f.text === null || f.text === undefined) {
        parts.push(`<missing ${f.name}>`);
        continue;
      }
      // BRACE-MATCHED FROM THE OPEN PAREN, exactly as python does it.
      const re = /scoreSlotSheet\(/g;
      for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
        let depth = 0;
        let k = m.index + m[0].length - 1;
        for (; k < f.text.length; k++) {
          if (f.text[k] === '(') depth += 1;
          else if (f.text[k] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        parts.push(tsBehaviour(f.text.slice(m.index, k + 1)));
      }
    }
  }
  return createHash('sha256').update(parts.join('')).digest('hex').slice(0, 12);
}


// ---------------------------------------------------------------------------
// NAME RESOLUTION, moved here 2026-09-27 so the fingerprint can be taken
// without python. Which app functions an item's answer passes through depends
// on WHICH PRIMITIVES IT AUTHORS, so the sheet decides -- and the sheet is on
// the tree.
//
// THE BASE SETS ARE SPLIT BY KIND because they fail differently: an ASK change
// invalidates the recorded ANSWERS, a SCORE change only the numbers computed
// from them, and a RENDER change neither -- it alters what the student READ,
// which no other stamp moves.
//
// `mappedVerdict` and `countedVerdicts` are NOT in the score base: they run
// only for an item that declares the primitive, so they are scoped below.
// Listing them in both places would leave the scoping inert, which it was
// until that line was corrected.
export const WEB_ASK_FNS = ['buildSlotSchema'];
export const WEB_SCORE_FNS = ['satisfiedMap', 'chargedMap', 'failedGate',
                              'scoreSlotSheet', 'isSatisfied'];
export const WEB_RENDER_FNS = ['composeSlotFeedback', 'displayVerdict'];

export const WEB_BY_PRIMITIVE: Record<string, Record<string, string[]>> = {
  equals: { render: ['computedVerdict'] },
  expect: { render: ['expectedVerdict'] },
  maps: { render: ['mappedVerdict'], score: ['mappedVerdict'] },
  counts: { render: ['countedVerdicts'], score: ['countedVerdicts'] },
  forbid: { render: ['forbidden'] },
};

/**
 * The app functions this item's answer passes through, for one kind.
 *
 * `declared` says which primitives the item authors. Pass null for the
 * CORPUS-WIDE view -- every function any item could reach -- which is what the
 * header quotes and what an UNKNOWN shape falls back to: assuming all of it is
 * the conservative answer, because a fingerprint that covers too little is one
 * that fails to move.
 */
export function webParts(kind: string, declared: string[] | null): string[] {
  const base = kind === 'ask' ? WEB_ASK_FNS
             : kind === 'score' ? WEB_SCORE_FNS
             : WEB_RENDER_FNS;
  if (declared === null) {
    const every = [...base];
    for (const m of Object.values(WEB_BY_PRIMITIVE)) {
      for (const n of m[kind] ?? []) if (!every.includes(n)) every.push(n);
    }
    return every;
  }
  const names = [...base];
  for (const [prim, byKind] of Object.entries(WEB_BY_PRIMITIVE)) {
    if (!declared.includes(prim)) continue;
    for (const n of byKind[kind] ?? []) if (!names.includes(n)) names.push(n);
  }
  return names;
}
