// packages/shared/components/blocks/language-arts/TextSelection/textSelectionModel.ts
//
// Pure, framework-free model shared by the three pieces of the TextSelection
// family:
//
//   - _TextSelectionInput.tsx   renders the passage and reads back tokens
//   - TextSelectionInput.ts     exposes `getExpectedSelections` as a local
//   - TextSelectionGrader.ts    scores a stored selection against the key
//
// ONE tokenization lives here, and it runs exactly once per parse. `projectParse`
// tokenizes the passage a single time and derives BOTH the render tokens and the
// grader's segment facts from that one pass, memoized on the parsed Document (a
// stable content object). The renderer, the input's `getExpectedSelections`
// local, and the grader all read that shared projection, so a stored selection —
// an array of word indices — means the same thing everywhere and no consumer
// re-tokenizes.
//
// The grammar (textSelection.pegjs) marks four kinds of segment in the passage:
//   [required]        words the learner must select
//   {optional}        bonus words — never help nor hurt the score
//   <<trigger>>       decoy words that, when selected, count against the score
//   plain text        everything else — selecting it counts against the score
//
// A parsed Document is `{ prompt, segments, scoring, targetedFeedback }`.
//
// The selectable UNIT is the word by default. An input carrying a
// `separatorRegexp` attribute instead selects CHUNKS, projected over the same
// token stream by `projectChunks` below; the stored value is the same array of
// word indices either way, so nothing downstream of the renderer changes.

// ─── Parsed grammar shapes ───────────────────────────────────────────────────

export type SegmentType = 'required' | 'optional' | 'feedback_trigger' | 'text';

export interface ParsedSegment {
  type: SegmentType;
  content: string;
  id?: string | null;
}

export interface ScoringRule {
  condition: string;
  feedback: string;
}

export interface ParsedDocument {
  prompt: string;
  segments: ParsedSegment[];
  scoring: ScoringRule[];
  targetedFeedback: Record<string, string>;
  error?: boolean;
}

// ─── Tokenization ────────────────────────────────────────────────────────────

// A word token carries a stable `index` (its position in the selection space)
// plus the metadata the renderer needs for styling. Whitespace is preserved as
// its own token (index -1) so the passage reads naturally, but only real words
// are selectable.
export interface WordToken {
  index: number;
  text: string;
  segmentIndex: number;
  segmentType: SegmentType;
  segmentId: string | null;
  isRequired: boolean;
  isOptional: boolean;
  isFeedbackTrigger: boolean;
  isSpace: false;
}
export interface SpaceToken { index: -1; text: string; isSpace: true }
export type Token = WordToken | SpaceToken;

/**
 * Split a parsed passage into word/space tokens with stable indices. This is
 * the single source of truth for what a selected index refers to.
 */
export function tokenize(segments: ParsedSegment[]): Token[] {
  const tokens: Token[] = [];
  let wordIndex = 0;

  segments.forEach((segment, segmentIndex) => {
    // Split on whitespace runs, keeping the separators so spacing survives.
    for (const piece of segment.content.split(/(\s+)/)) {
      if (piece === '') continue;
      if (piece.trim() === '') {
        tokens.push({ index: -1, text: piece, isSpace: true });
        continue;
      }
      tokens.push({
        index: wordIndex++,
        text: piece,
        segmentIndex,
        segmentType: segment.type,
        segmentId: segment.id ?? null,
        isRequired: segment.type === 'required',
        isOptional: segment.type === 'optional',
        isFeedbackTrigger: segment.type === 'feedback_trigger',
        isSpace: false,
      });
    }
  });

  return tokens;
}

// ─── Answer-key projection ───────────────────────────────────────────────────

// One projected segment: its type, the word indices it spans, and its words as
// text (for the display answer). Empty (whitespace-only) segments drop out.
export interface SegmentProjection {
  id: string | null;
  type: SegmentType;
  wordIndices: number[];
  words: string[];
}

// Everything the grader needs, computed from the parsed passage alone.
export interface ExpectedSelections {
  segments: SegmentProjection[];
  scoring: ScoringRule[];
  targetedFeedback: Record<string, string>;
}

// Build the grader's segment-level facts from ALREADY-tokenized words (no second
// tokenization). Empty (whitespace-only) segments contribute no words and drop out.
function projectExpected(tokens: Token[], parsed: ParsedDocument): ExpectedSelections {
  const byIndex = new Map<number, SegmentProjection>();
  const projections: SegmentProjection[] = [];

  for (const token of tokens) {
    if (token.isSpace) continue;
    let projection = byIndex.get(token.segmentIndex);
    if (!projection) {
      projection = { id: token.segmentId, type: token.segmentType, wordIndices: [], words: [] };
      byIndex.set(token.segmentIndex, projection);
      projections.push(projection);
    }
    projection.wordIndices.push(token.index);
    projection.words.push(token.text);
  }

  return {
    segments: projections,
    scoring: parsed.scoring ?? [],
    targetedFeedback: parsed.targetedFeedback ?? {},
  };
}

// The per-parse projection: the render tokens and the grader's answer-key facts,
// both derived from a SINGLE tokenization of the passage.
export interface ParseProjection {
  tokens: Token[];
  expected: ExpectedSelections;
}

// Memoized on the parsed Document itself. The parser mints one Document per
// passage and hands the same object to every consumer, so keying here collapses
// the renderer's, the local's, and the grader's tokenizations into one. A WeakMap
// drops each entry as soon as its Document is unreferenced. (This is the
// selectGradingState per-snapshot memo, applied to a content object.)
const projectionByParse = new WeakMap<ParsedDocument, ParseProjection>();

/**
 * Tokenize a passage exactly once and project it into render tokens + grader
 * facts. Idempotent per Document: the first call computes, the rest hit the memo.
 * Pure over the parse — callable from selectors, node, and analytics, none of
 * which have a rendered DOM.
 */
export function projectParse(parsed: ParsedDocument): ParseProjection {
  let projection = projectionByParse.get(parsed);
  if (projection) return projection;
  const tokens = tokenize(parsed.segments);
  projection = { tokens, expected: projectExpected(tokens, parsed) };
  projectionByParse.set(parsed, projection);
  return projection;
}

/** The grader's segment-level facts for a parsed passage (the memoized projection). */
export function expectedSelections(parsed: ParsedDocument): ExpectedSelections {
  return projectParse(parsed).expected;
}

/** The required phrases, in passage order — the answer to reveal on Show Answer. */
export function displayAnswerFromExpected(expected: ExpectedSelections): string[] {
  return expected.segments
    .filter(s => s.type === 'required')
    .map(s => s.words.join(' '));
}

// ─── The one "is this segment selected?" predicate ───────────────────────────

/**
 * Is a segment fully selected? A segment counts as selected only when EVERY one
 * of its words is in the selection — a two-word phrase needs both words. This is
 * the single definition of "selected," shared by scoring (a required phrase is
 * "found" ⇔ selected) and by targeted feedback (a segment's note shows ⇔
 * selected). Selecting one word of "solar panels" is therefore not the phrase:
 * it earns no credit and fires no "Correct!" note, which is exactly the mismatch
 * this predicate exists to prevent — display and scoring can no longer disagree.
 *
 * (Empty/whitespace-only segments have no word indices and are never selected.
 * The decoy penalty asks a different question — "was this decoy touched at all?"
 * — and lives in computeStats, not here.)
 */
export function isSegmentSelected(wordIndices: number[], selected: Set<number>): boolean {
  return wordIndices.length > 0 && wordIndices.every(i => selected.has(i));
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface SelectionStats {
  requiredFound: number;   // required segments with EVERY word selected
  totalRequired: number;   // required segments in the passage
  wrongSelected: number;   // contiguous runs of selected plain words + touched decoys
  complete: boolean;       // all required found AND nothing wrong selected
}

/**
 * Tally a stored selection against the answer key.
 *
 * A required segment counts as "found" only when all of its words are selected
 * (a two-word phrase needs both). Optional segments are ignored entirely.
 * `wrongSelected` is the penalty pool at a CONTIGUOUS-MISTAKE granularity: each
 * unbroken run of selected plain-text words counts once (a careless five-word
 * drag is one mistake, not five), and each decoy (`<<...>>`) segment touched at
 * all counts once. The two error kinds are thus weighed the same way — one slip,
 * one penalty — so an incidental drag can no longer outweigh a planted trap.
 */
export function computeStats(selected: Set<number>, expected: ExpectedSelections): SelectionStats {
  let requiredFound = 0;
  let totalRequired = 0;
  let wrongSelected = 0;

  // Plain-word penalties are counted by contiguous run, so we collect the selected
  // plain-text indices first and tally runs afterwards. Segments arrive in passage
  // order with ascending indices, so the collected list is already sorted; a run
  // breaks wherever the index isn't one past its predecessor (a required/optional
  // word, a decoy, or an unselected gap sitting between two plain runs).
  const selectedPlainIndices: number[] = [];

  for (const segment of expected.segments) {
    if (segment.wordIndices.length === 0) continue;
    switch (segment.type) {
      case 'required':
        totalRequired += 1;
        if (isSegmentSelected(segment.wordIndices, selected)) requiredFound += 1;
        break;
      case 'text':
        for (const i of segment.wordIndices) if (selected.has(i)) selectedPlainIndices.push(i);
        break;
      case 'feedback_trigger':
        // A decoy touched at all is one error.
        if (segment.wordIndices.some(i => selected.has(i))) wrongSelected += 1;
        break;
      case 'optional':
        break; // never counts, either way
    }
  }

  for (let k = 0; k < selectedPlainIndices.length; k++) {
    // Start of a new contiguous run ⇒ one more plain-text mistake.
    if (k === 0 || selectedPlainIndices[k] !== selectedPlainIndices[k - 1] + 1) wrongSelected += 1;
  }

  const complete = totalRequired > 0 && requiredFound === totalRequired && wrongSelected === 0;
  return { requiredFound, totalRequired, wrongSelected, complete };
}

/**
 * Subtractive partial credit:
 *   score = clamp((requiredFound − wrongSelected) / totalRequired, 0, 1)
 *
 * The subtraction is what stops "select every word" from earning full credit —
 * the old implementation divided by required alone and handed out a perfect
 * score for selecting the whole passage.
 */
export function scoreFromStats(stats: SelectionStats): number {
  if (stats.totalRequired === 0) return 0;
  const raw = (stats.requiredFound - stats.wrongSelected) / stats.totalRequired;
  return Math.max(0, Math.min(1, raw));
}

// ─── Scoring-rules → feedback message ────────────────────────────────────────

// The grammar's scoring section maps conditions to messages, evaluated against
// the same stats the score uses. Condition formats:
//   'all'              all required found, no errors
//   'found>=1'         a comparison on one field (found | errors | incorrect)
//   'found>0,errors=0' comma-separated conjunction
//   ''                 always matches (the default/fallback rule)
type RuleVars = { found: number; errors: number; incorrect: number; total: number };

function compare(val: number, op: string, num: number): boolean {
  switch (op) {
    case '>=': return val >= num;
    case '<=': return val <= num;
    case '>':  return val > num;
    case '<':  return val < num;
    case '=':  return val === num;
    default:   return false;
  }
}

function evalPart(part: string, vars: RuleVars): boolean {
  const m = part.match(/^(found|errors|incorrect)?(>=|<=|>|<|=)(\d+)$/);
  if (!m) return false;
  const field = (m[1] || 'found') as keyof RuleVars;
  return compare(vars[field], m[2], parseInt(m[3], 10));
}

/** First matching rule's feedback, or null if none match (or no rules). */
export function evaluateScoringRules(rules: ScoringRule[], vars: RuleVars): string | null {
  for (const rule of rules) {
    const cond = rule.condition.trim();
    if (cond === '') return rule.feedback; // default/fallback
    if (cond === 'all') {
      if (vars.found === vars.total && vars.errors === 0) return rule.feedback;
      continue;
    }
    if (cond.split(',').every(p => evalPart(p.trim(), vars))) return rule.feedback;
  }
  return null;
}

/**
 * The feedback message for a graded selection: an authored scoring rule if one
 * matches, otherwise a plain "n/m found" summary. Complete answers get no
 * message (the correctness icon says it) unless a rule speaks up.
 */
export function messageForStats(stats: SelectionStats, scoring: ScoringRule[]): string {
  const vars: RuleVars = {
    found: stats.requiredFound,
    errors: stats.wrongSelected,
    incorrect: stats.wrongSelected,
    total: stats.totalRequired,
  };
  const ruleMessage = scoring.length > 0 ? evaluateScoringRules(scoring, vars) : null;
  if (ruleMessage != null) return ruleMessage;
  if (stats.complete) return '';
  const errorNote = stats.wrongSelected > 0 ? ` • ${stats.wrongSelected} incorrect` : '';
  return `${stats.requiredFound}/${stats.totalRequired} found${errorNote}`;
}

// ─── Targeted feedback ───────────────────────────────────────────────────────

// A per-term note to show beneath the passage: the segment's words (the label
// the learner sees) and the authored text.
export interface FeedbackItem { id: string; label: string; text: string }

/**
 * The targeted-feedback notes for a selection: one per labeled segment that is
 * fully selected (`isSegmentSelected`) and has an authored note. A partially
 * selected phrase shows nothing — the same every-word predicate the score uses,
 * so a note never contradicts the correctness the learner sees. Passage order;
 * the first segment for a repeated label wins.
 */
export function targetedFeedbackItems(
  selected: Set<number>,
  expected: ExpectedSelections,
): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const seen = new Set<string>();
  for (const segment of expected.segments) {
    const id = segment.id;
    if (!id || seen.has(id)) continue;
    const text = expected.targetedFeedback[id];
    if (!text || !isSegmentSelected(segment.wordIndices, selected)) continue;
    seen.add(id);
    items.push({ id, label: segment.words.join(' '), text });
  }
  return items;
}

// --- Chunk projection (`separatorRegexp`) ------------------------------------
//
// By default the selectable unit is the word: `tokenize` splits the passage on
// the whitespace regexp /(\s+)/. `separatorRegexp` generalises that split. When
// an input carries one, the passage is divided into CHUNKS at every match and
// the CHUNK -- not the word -- becomes the selectable unit. Without the
// attribute nothing below runs and the block behaves exactly as it always has.
//
// The attribute is a JavaScript regexp SOURCE string, compiled once with the `g`
// flag and no others; the author escapes as needed (`\.` for sentences, `\|` for
// hand-placed markers). Two authoring errors fail fast here: a source the RegExp
// constructor rejects, and a source that matches the empty string (it would
// split between every character).
//
// `separatorHidden` says what happens to the matched text. False (the default)
// keeps the match at the END of the left chunk, where it renders as content -- so
// `\.` keeps each sentence's period. True consumes the match: it is never
// rendered, and the whitespace around it is normalised so words do not run
// together.
//
// Chunk boundaries come from the separator; CORRECTNESS still comes from the
// [required] / {optional} / <<decoy>> brackets, and the stored value is still the
// array of selected word indices -- selecting a chunk writes all of its word
// indices. So the grader, the scoring, the events, and the analytics heatmap all
// read chunk mode without knowing it exists. What chunk mode does forbid is a
// bracket span that straddles a boundary: the learner could never select it, so
// it is an authoring error and this projection throws.
//
// The match is found in the passage text, not inside a single token, so a
// pattern may cover whitespace as well as word characters (e.g. a lookbehind
// pattern like `(?<=[.!?])\s+`). A token that straddles a boundary cannot be cut
// in half -- it carries one stable index -- so it stays with the chunk that holds
// its content: a token whose remaining text lies entirely after the match opens
// the new chunk, and every other straddling token closes the old one.

/** A chunk: the selectable unit when `separatorRegexp` is set. */
export interface Chunk {
  /** Position in the passage, 0-based. */
  index: number;
  /** Words and interior spaces in render order. In hidden mode a token's text
   *  has the separator removed; a token that was ONLY separator is absent. */
  tokens: Token[];
  /** The stable word indices this chunk writes when selected, ascending. */
  wordIndices: number[];
  /** The chunk as rendered -- the piece texts joined. */
  text: string;
}

export interface ChunkProjection {
  chunks: Chunk[];
  /** Word index to its chunk's index. A word consumed as a separator is absent. */
  chunkOfWord: Map<number, number>;
}

/** A token with rewritten text; keeps the index, so the stored value is stable. */
function withText(token: Token, text: string): Token {
  return token.isSpace ? { index: -1, text, isSpace: true } : { ...token, text };
}

/**
 * Compile the author's `separatorRegexp`. Throws on a source the RegExp
 * constructor rejects and on one that matches the empty string.
 */
export function compileSeparator(source: string, blockId: string): RegExp {
  let probe: RegExp;
  try {
    probe = new RegExp(source);
  } catch (e) {
    throw new Error(
      `TextSelectionInput ${blockId}: separatorRegexp "${source}" is not a valid ` +
      `regular expression: ${(e as Error).message}`,
    );
  }
  if (probe.test('')) {
    throw new Error(
      `TextSelectionInput ${blockId}: separatorRegexp "${source}" matches the empty ` +
      `string, so it would split the passage between every character. Use a pattern ` +
      `that must consume at least one character.`,
    );
  }
  return new RegExp(source, 'g');
}

/**
 * Divide an already-tokenized passage into chunks at every separator match.
 *
 * Pure over (tokens, separator, hidden): no DOM, no React, callable from tests,
 * node, and analytics. Chunks with no selectable word (a lone separator that was
 * consumed, or whitespace only) are dropped, so consecutive separators produce
 * one boundary rather than empty chunks. A passage with no match at all is one
 * chunk.
 */
export function projectChunks(
  tokens: Token[],
  expected: ExpectedSelections,
  separatorRegexp: string,
  separatorHidden: boolean,
  blockId: string,
): ChunkProjection {
  const separator = compileSeparator(separatorRegexp, blockId);

  // The passage text, with each token's span in it. Matching happens on the
  // whole text so a pattern may straddle token edges (whitespace included).
  let passage = '';
  const spans: { token: Token; start: number; end: number }[] = [];
  for (const token of tokens) {
    spans.push({ token, start: passage.length, end: passage.length + token.text.length });
    passage += token.text;
  }

  const matches: { start: number; end: number }[] = [];
  for (let m = separator.exec(passage); m !== null; m = separator.exec(passage)) {
    matches.push({ start: m.index, end: m.index + m[0].length });
  }

  const chunks: Chunk[] = [];
  let current: Token[] = [];

  // Close the chunk under construction. Leading and trailing whitespace is
  // dropped (the renderer puts a single space between chunks), and a chunk with
  // no selectable word never reaches the learner.
  const closeChunk = () => {
    let first = 0;
    let last = current.length;
    while (first < last && current[first].isSpace) first++;
    while (last > first && current[last - 1].isSpace) last--;
    const kept = current.slice(first, last);
    current = [];
    const wordIndices = kept.filter((t): t is WordToken => !t.isSpace).map(t => t.index);
    if (wordIndices.length === 0) return;
    chunks.push({
      index: chunks.length,
      tokens: kept,
      wordIndices,
      text: kept.map(t => t.text).join(''),
    });
  };

  let next = 0;  // first match not yet consumed
  for (const span of spans) {
    // Boundaries that closed before this token even starts.
    while (next < matches.length && matches[next].end <= span.start) {
      closeChunk();
      next++;
    }

    // Matches overlapping this token.
    let after = next;
    while (after < matches.length && matches[after].start < span.end) after++;
    if (after === next) {
      current.push(span.token);
      continue;
    }

    const firstMatch = matches[next];
    const lastMatch = matches[after - 1];
    const before = span.token.text.slice(0, Math.max(0, firstMatch.start - span.start));
    const trailing = span.token.text.slice(
      Math.min(span.token.text.length, Math.max(0, lastMatch.end - span.start)),
    );
    // Hidden: the separator is consumed. Visible: the match renders as content.
    const kept = separatorHidden ? before + trailing : span.token.text;
    // A token whose surviving text lies wholly AFTER the separator belongs to the
    // chunk the separator opens; every other straddling token closes the old one.
    const opensChunk = before === '' && trailing !== '';

    if (opensChunk) closeChunk();
    if (kept !== '') current.push(withText(span.token, kept));
    if (!opensChunk) closeChunk();

    // A match that runs on past this token stays current for the next one.
    next = after;
    while (next > 0 && matches[next - 1].end > span.end) next--;
  }
  closeChunk();

  const chunkOfWord = new Map<number, number>();
  for (const chunk of chunks) {
    for (const index of chunk.wordIndices) chunkOfWord.set(index, chunk.index);
  }

  // A bracket span the learner could never select whole is an authoring error.
  for (const segment of expected.segments) {
    if (segment.type === 'text' || segment.wordIndices.length === 0) continue;
    const homes = new Set<number>();
    for (const index of segment.wordIndices) {
      const home = chunkOfWord.get(index);
      if (home !== undefined) homes.add(home);
    }
    if (homes.size <= 1) continue;
    const across = [...homes].sort((a, b) => a - b);
    throw new Error(
      `TextSelectionInput ${blockId}: the marked span "${segment.words.join(' ')}" crosses a ` +
      `separator boundary. separatorRegexp "${separatorRegexp}" splits it across chunks ` +
      `${across.join(' and ')} ("${chunks[across[0]].text}" then "${chunks[across[1]].text}"). ` +
      `A marked span must lie wholly inside one chunk.`,
    );
  }

  return { chunks, chunkOfWord };
}

// Memoized per (Document, separator, hidden), alongside the token projection, so
// the renderer's re-renders cost one Map lookup.
const chunksByParse = new WeakMap<ParsedDocument, Map<string, ChunkProjection>>();

/** The chunk projection for a parsed passage (memoized). */
export function chunkProjection(
  parsed: ParsedDocument,
  separatorRegexp: string,
  separatorHidden: boolean,
  blockId: string,
): ChunkProjection {
  const key = `${separatorHidden ? 'hidden' : 'shown'} ${separatorRegexp}`;
  let byKey = chunksByParse.get(parsed);
  if (!byKey) {
    byKey = new Map();
    chunksByParse.set(parsed, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const { tokens, expected } = projectParse(parsed);
  const projection = projectChunks(tokens, expected, separatorRegexp, separatorHidden, blockId);
  byKey.set(key, projection);
  return projection;
}

// --- Applying a gesture to the selection -------------------------------------

/**
 * Apply one click-or-drag gesture in TOKEN mode.
 *
 * The word the gesture STARTS on sets the direction: starting on an unselected
 * word SELECTS every word the gesture touches, starting on a selected word
 * DESELECTS every word it touches. A single click is the one-word case of that
 * rule, so it still reads as a toggle -- but a corrective second drag back over
 * an overshoot now clears the overshoot instead of XOR-ing away the correct
 * words underneath it.
 *
 * `anchor` is the word the pointer went down on, or null when the gesture began
 * on whitespace; in that case the first touched word decides the direction.
 */
export function applyGesture(
  committed: Set<number>,
  touched: Set<number>,
  anchor: number | null,
): Set<number> {
  if (touched.size === 0) return committed;
  const start = anchor !== null && touched.has(anchor) ? anchor : Math.min(...touched);
  const select = !committed.has(start);
  const next = new Set(committed);
  for (const index of touched) {
    if (select) next.add(index); else next.delete(index);
  }
  return next;
}

/**
 * Apply one gesture in CHUNK mode: every chunk the gesture touched flips once,
 * each on its own prior state -- a fully selected chunk clears, any other chunk
 * fills. Selecting a chunk writes all of its word indices, so the stored value
 * stays the same array of word indices token mode writes.
 */
export function toggleChunks(committed: Set<number>, touched: Chunk[]): Set<number> {
  if (touched.length === 0) return committed;
  const next = new Set(committed);
  for (const chunk of touched) {
    const full = isSegmentSelected(chunk.wordIndices, committed);
    for (const index of chunk.wordIndices) {
      if (full) next.delete(index); else next.add(index);
    }
  }
  return next;
}

// --- Writing the gesture anchor ----------------------------------------------

/**
 * The write-on-change gate for `gestureAnchor`: true when the store actually
 * has something new to record.
 *
 * The anchor lives in Redux, so every write is an event in the log, and the
 * pointer offers a write more often than it changes anything -- the container's
 * capture-phase handler clears the anchor on EVERY mousedown, including the
 * ones that land on whitespace with the anchor already clear. Gating on the
 * value bounds the log to the transitions that mean something: one event per
 * mousedown that lands on a word, one when the gesture ends.
 */
export function anchorChanged(current: number | null, next: number | null): boolean {
  return current !== next;
}
