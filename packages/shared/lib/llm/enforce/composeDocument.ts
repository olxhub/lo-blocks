// Composing a split document: the generic half with each course case placed at
// its anchor.
//
// Ported from `compose_docs.compose` (goal K), so that
// `composed_documents_are_current` can be judged here. It reproduces python's
// output BYTE FOR BYTE -- a composed copy differing only in whitespace is still
// a stale copy, and a check that normalised would never fire.
//
// TWO PLACEMENTS, because the documents' own shape forced the second.
// `see: qc:NAME` puts a case directly AFTER the anchored heading, which is
// right when the whole section below it is that case. It cannot express "after
// this section" -- and a generic subsection sitting BETWEEN two course ones is
// the normal arrangement, not an exception. `see: qc:NAME end` holds the block
// until the anchored section FINISHES, which is what `holding` tracks.
//
// A CASE MAY ONLY ATTACH TO A SECTION LINE -- a heading, or a list entry, since
// a ledger anchors its entries. Anything else is running prose, and placing a
// case there splits the paragraph, so this refuses instead.

const ANCHOR = /^<!--\s*qc:([A-Za-z0-9_.-]+)\s*-->\s*$/;
const BLOCK_OPENS = /^see:\s*qc:([A-Za-z0-9_.-]+)\s*$/;
const BLOCK_OPENS_END = /^see:\s*qc:([A-Za-z0-9_.-]+)\s+end\s*$/;
const HEADING = /^(#{1,6}) /;
const SECTION_LINE = /^(?:#{1,6} |\s*(?:[-*+]|\d+\.) )/;

type Key = string;
const key = (anchor: string, mode: string): Key => anchor + ' ' + mode;

/**
 * `{anchor,mode: [block, ...]}` from a course half, in file order.
 *
 * Text before the first reference is a PREAMBLE belonging to no anchor; python
 * returns it under the empty key and places none of it, and dropping it
 * silently is how a split loses content.
 */
export function courseBlocks(text: string): Map<Key, string[]> {
  const out = new Map<Key, string[]>();
  let current: Key | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    if (current !== null) {
      const at = out.get(current) ?? [];
      at.push(buf.join(''));
      out.set(current, at);
    }
    buf = [];
  };
  for (const line of splitKeepEnds(text)) {
    const bare = line.replace(/\n$/, '');
    const mEnd = BLOCK_OPENS_END.exec(bare);
    const m = mEnd ?? BLOCK_OPENS.exec(bare);
    if (m) {
      flush();
      current = key(m[1], mEnd ? 'end' : 'line');
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

export class ComposeRefused extends Error {}

/** The whole document: the generic half with each case at its anchor. */
export function composeDocument(name: string, generic: string, specific: string): string {
  const blocks = courseBlocks(specific);
  if (blocks.size === 0) return generic;

  const out: string[] = [];
  let pending: string | null = null;
  let placed = 0;
  let holding: Array<[string, number]> = [];

  for (const line of splitKeepEnds(generic)) {
    const h = HEADING.exec(line);
    const isAnchor = ANCHOR.test(line.replace(/\n$/, ''));
    if ((h || isAnchor) && holding.length) {
      const level = h ? h[1].length : 1;
      const keep: Array<[string, number]> = [];
      for (const pair of holding) {
        if (level <= pair[1]) {
          for (const block of blocks.get(key(pair[0], 'end')) ?? []) { out.push(block); placed++; }
        } else keep.push(pair);
      }
      holding = keep;
    }
    out.push(line);
    const m = ANCHOR.exec(line.replace(/\n$/, ''));
    if (m) { pending = m[1]; continue; }
    if (pending !== null && line.trim()) {
      if ((blocks.get(key(pending, 'line')) ?? []).length && !SECTION_LINE.test(line)) {
        throw new ComposeRefused(
          'compose_docs: ' + name + ' anchors `qc:' + pending + '` above a line of prose');
      }
      for (const block of blocks.get(key(pending, 'line')) ?? []) { out.push(block); placed++; }
      if (blocks.has(key(pending, 'end'))) {
        const hm = HEADING.exec(line);
        holding.push([pending, hm ? hm[1].length : 6]);
      }
      pending = null;
    }
  }
  if (pending !== null) {
    for (const block of blocks.get(key(pending, 'line')) ?? []) { out.push(block); placed++; }
    for (const block of blocks.get(key(pending, 'end')) ?? []) { out.push(block); placed++; }
    holding = holding.filter(x => x[0] !== pending);
  }
  for (const pair of holding) {
    for (const block of blocks.get(key(pair[0], 'end')) ?? []) { out.push(block); placed++; }
  }

  let want = 0;
  for (const v of blocks.values()) want += v.length;
  if (placed !== want) {
    throw new ComposeRefused(
      'compose_docs: ' + name + ' composed ' + placed + ' of ' + want + ' block(s); ' +
      (want - placed) + ' would have vanished');
  }
  return out.join('');
}

/** python's `str.splitlines(keepends=True)`. */
function splitKeepEnds(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}
