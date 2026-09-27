// CPython's `difflib.SequenceMatcher(...).ratio()`, reproduced exactly.
//
// Goal K. Ported checks compare prose for DRIFT -- "90% identical but not
// equal" -- and that threshold is only meaningful against the same similarity
// measure python used. JavaScript has no equivalent, and every convenient
// substitute (Levenshtein, Dice, longest-common-subsequence) returns a
// DIFFERENT number, so a check ported with an approximate ratio silently
// reports a different set of cells. That is indistinguishable, in a baseline
// diff, from a real change.
//
// So this is a transcription of the algorithm, not an approximation of the
// result, and it is verified DIFFERENTIALLY against python rather than by
// unit tests alone: hundreds of random and adversarial pairs, every ratio
// equal to python's to full double precision.
//
// THE PARTS THAT ARE EASY TO GET WRONG, all of them load-bearing:
//   * `autojunk` is ON by default and only engages when `b` has 200+ elements,
//     at which point any element occurring in more than 1% of b is treated as
//     junk. Prose strings cross 200 characters routinely, so omitting it makes
//     long comparisons disagree while short ones agree -- the worst failure
//     shape, because the unit tests pass.
//   * the longest-match search extends the match TWICE on each side: first
//     over non-junk, then over junk. Doing only the first is a common
//     simplification and changes the block sizes.
//   * `ratio` counts MATCHED ELEMENTS, 2M/T, not edit distance.

/** One matching block, as python's `get_matching_blocks` yields it. */
type Block = { a: number; b: number; size: number };

export class SequenceMatcher {
  private a: string;
  private b: string;
  private b2j = new Map<string, number[]>();
  private bjunk = new Set<string>();

  constructor(a: string, b: string, autojunk = true) {
    this.a = a;
    this.b = b;
    this.chainB(autojunk);
  }

  /** `__chain_b`: index b, then strip the popular elements when autojunk applies. */
  private chainB(autojunk: boolean): void {
    const b = this.b;
    for (let i = 0; i < b.length; i++) {
      const ch = b[i];
      const at = this.b2j.get(ch);
      if (at) at.push(i);
      else this.b2j.set(ch, [i]);
    }
    // isjunk is null here -- the only junk is the POPULAR set below.
    const n = b.length;
    if (autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [ch, idxs] of [...this.b2j.entries()]) {
        if (idxs.length > ntest) {
          this.bjunk.add(ch);
          this.b2j.delete(ch);
        }
      }
    }
  }

  private isBJunk(ch: string): boolean {
    return this.bjunk.has(ch);
  }

  /** `find_longest_match`, including BOTH extension passes. */
  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Block {
    const { a, b } = this;
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      const idxs = this.b2j.get(a[i]) ?? [];
      for (const j of idxs) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }
    // Extend over NON-junk on both sides...
    while (besti > alo && bestj > blo && !this.isBJunk(b[bestj - 1])
           && a[besti - 1] === b[bestj - 1]) {
      besti--; bestj--; bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi
           && !this.isBJunk(b[bestj + bestsize])
           && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    // ...then over JUNK. Omitting this pass changes the block sizes.
    while (besti > alo && bestj > blo && this.isBJunk(b[bestj - 1])
           && a[besti - 1] === b[bestj - 1]) {
      besti--; bestj--; bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi
           && this.isBJunk(b[bestj + bestsize])
           && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return { a: besti, b: bestj, size: bestsize };
  }

  /** `get_matching_blocks`, minus the terminating sentinel (unused by ratio). */
  matchingBlocks(): Block[] {
    const queue: Array<[number, number, number, number]> = [[0, this.a.length, 0, this.b.length]];
    const out: Block[] = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const m = this.findLongestMatch(alo, ahi, blo, bhi);
      if (m.size) {
        out.push(m);
        if (alo < m.a && blo < m.b) queue.push([alo, m.a, blo, m.b]);
        if (m.a + m.size < ahi && m.b + m.size < bhi) {
          queue.push([m.a + m.size, ahi, m.b + m.size, bhi]);
        }
      }
    }
    return out;
  }

  /** `ratio()`: twice the matched elements over the combined length. */
  ratio(): number {
    const matches = this.matchingBlocks().reduce((n, m) => n + m.size, 0);
    const total = this.a.length + this.b.length;
    return total ? (2.0 * matches) / total : 1.0;
  }
}

/** `difflib.SequenceMatcher(None, a, b).ratio()`. */
export function sequenceRatio(a: string, b: string): number {
  return new SequenceMatcher(a, b).ratio();
}
