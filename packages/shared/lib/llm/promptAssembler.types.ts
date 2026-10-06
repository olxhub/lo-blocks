/**
 * The assembler's input: everything needed to produce one item's prompt body
 * and its sheet attributes, and nothing that names a subject.
 *
 * MEASURED, NOT DESIGNED. Every field below is one the current generator
 * actually reads (`stage02_assembler_surface.py`, 2026-09-14, scanning the whole
 * of olx_prompts.py rather than the prose builders alone). Two fields the
 * generator reads are deliberately ABSENT: `exemplars` and `gates` are set by
 * none of the 26 items and appear nowhere in the rubric modules, so modelling
 * them would be modelling nothing.
 *
 * WHY THERE ARE NO SUBJECT-SPECIFIC FLAGS. The generator carries two booleans
 * that select prose variants, each named after the subject matter it selects.
 * Ported as named flags they would put a subject's vocabulary into the engine
 * permanently, which C2 forbids -- and C2 covers comments too, which is why the
 * names are not repeated here. They are also not really flags: each selects a
 * BLOCK OF PROSE, and prose is content. So the item declares the prose and the
 * assembler renders it.
 *
 * THE DIVISION OF LABOUR, stated once: the ENGINE orders, numbers and lays out;
 * the RUBRIC supplies every word. Nothing here interprets a word it is given.
 */

/**
 * A slot as the sheet defines it.
 *
 * MEASURED from `parse_slots` output, not guessed: seven fields, all present on
 * every slot. The first draft carried `key` and `options` alone, which is what
 * the PROSE sections need; the checklist needs the rest, and a slot missing
 * `gates` renders without its **GATE** marker -- silently, and only on the items
 * that have one.
 */
export interface AssemblerSlot {
  key: string
  /** Human label. Carried for completeness; the checklist renders `key`. */
  label?: string
  /** The verdicts this slot may be answered with, satisfied one first. */
  options: string[]
  /** An unsatisfied gate is the whole story for the item. */
  gates: boolean
  pts?: number | null
  /** Set when the slot is answered with a NUMBER rather than a verdict. */
  count_max?: number | null
  /** Set when the slot names WHICH option was chosen, not whether it is right. */
  picks?: string | null
}

/** A counting group: one number answered, its members derived from it. */
export interface CountGroup { key: string; slots: string[] }

/**
 * One line of credit.
 *
 * MEASURED over all 116 credit entries in the 26 items (2026-09-14). The first
 * draft of this interface had four fields and was wrong about three things, all
 * of which would have compiled and failed at the byte diff:
 *   - `desc` is on EVERY entry and was missing entirely;
 *   - `pts` is OPTIONAL (86 of 116), and was typed as required;
 *   - `gates` is a CREDIT-ENTRY field (7 of 116), not an item field -- an
 *     item-level scan could not see it and reported it as dead.
 */
export interface CreditEntry {
  /** The slot this credit is about. */
  what: string                        // 116/116
  /** The judging text for it. */
  desc: string                        // 116/116
  pts?: number                        // 86/116
  /** Deduction codes this credit line answers to. */
  codes?: string[]                    // 70/116
  verdicts?: string[]                 // 64/116
  /** Extra judging rule carried into the generated prose. */
  rule?: string                       // 30/116
  /** The model reports this value rather than being judged on it. */
  reported?: boolean                  // 28/116
  /** Credit conditional on another check holding. */
  gates?: string[]                    //  7/116
  /** Verdicts that are not satisfying and still cost nothing (see `free=`). */
  free?: string[]                     //  1/116
}

/** A deduction the paper ledger can charge, with the words it charges in. */
export interface DeductionEntry {
  code: string                        // 107/107
  pts: number                         // 107/107
  text: string                        // 107/107
  /**
   * Chargeable more than once. 16 of 107, and not cosmetic: 2b's
   * MISSING_SENTENCE is repeatable, so a reader that ignores this charges once
   * where the ledger charges per sentence.
   */
  repeatable?: boolean                //  16/107
}

/**
 * A prose block the item declares, rendered in order after the question.
 *
 * This is what replaces the generator's extra-section boolean. That branch
 * appended a heading, one line of prose, and a reference to an input field; all
 * three are content, so all three are declared here. An item that wants the
 * section has one; an item that does not, does not. The engine never learns
 * why -- nor what the section is about.
 */
export interface DeclaredSection {
  /** Rendered as a `##` heading. */
  heading: string
  /** Prose under the heading. Optional: some sections are a heading and a ref. */
  body?: string
  /** An input field to quote, rendered as the assembler's reference block. */
  field?: string
}

/**
 * One numbered clause of a judging frame.
 *
 * This is what replaces the generator's variant BOOLEANS. Those chose which
 * clauses appeared, and each was named for the subject matter it selected;
 * declaring the clauses does the same work without the engine knowing what any
 * of them mean. Numbering stays with the engine, because numbering is layout.
 *
 * The names themselves are deliberately not repeated here: they are content
 * vocabulary, and C2 covers comments as well as code.
 */
export interface FrameClause {
  /** Stable name, for cross-referencing from a rule. Never rendered as prose. */
  key: string
  /** The clause itself, verbatim. */
  text: string
}

/**
 * One other item's answers, already resolved to labelled field references.
 *
 * The rubric says `context: ['2a']`; resolving that into these lines is the
 * build's job, not the engine's.
 */
export interface ContextBlock {
  /** Rendered as a `###` sub-heading: the other item's id. */
  heading: string
  /** Label and input-field id, in render order. */
  lines: Array<{ label: string; field: string }>
}

/** A computed rule, carried through to the generated sheet attributes. */
export interface ExpectRule { key: string; left: string; value: string }
export interface ForbidRule {
  key: string
  conds: Array<{ slot: string; value: string }>
}
export interface MapRule {
  key: string
  pick: string
  pairs: Array<{ value: string; verdict: string }>
}

/**
 * One rubric item, as the assembler needs it.
 *
 * Field presence across the 26 items at the time of measurement is noted so the
 * optionality is a fact rather than a guess: a field marked optional here is one
 * most items genuinely lack.
 */
export interface AssemblerItem {
  id: string                          // 26/26
  max: number                         // 26/26
  question: string                    // 26/26
  credit: CreditEntry[]               // 26/26
  deductions: DeductionEntry[]        // 26/26
  /**
   * Read-only context from the student's OTHER answers.
   *
   * NOT PROSE. The rubric stores item ids (`['2a']`), which the generator
   * expands into a labelled reference block -- "Verdict:", "How (1):", "How
   * (2):" -- by looking up what fields that other item has. That lookup needs
   * rubric knowledge the engine must not hold, so the CALLER resolves the id and
   * passes the labelled lines. Typing this as `string[]` compiled and would have
   * rendered the wrong section.
   */
  context: ContextBlock[]             // 26/26, frequently []
  guidance: string[]                  // 26/26

  /** Build the judging sheet from declared clauses rather than from credit. */
  deriveFromClauses?: boolean         // 8/26
  /** The judging clauses, in render order. Replaces the variant booleans. */
  clauses?: FrameClause[]
  /** Extra declared prose blocks, replacing a generator-side boolean. */
  sections?: DeclaredSection[]

  /**
   * Conditions this item declares, matched against a frame segment's `when`.
   *
   * NAMES ARE DATA. The engine tests membership and nothing else -- it never
   * learns what a condition means, which is what keeps a subject's vocabulary
   * out of lo-blocks (C2). The generator instead carried a named boolean per
   * condition, which put four subject words into the interface.
   */
  conditions?: string[]

  /**
   * Values substituted into `{placeholder}` in frame segments.
   *
   * Also names-as-data: one item supplies two of these today, and the engine
   * knows only that a key was asked for and a value was given.
   */
  frameParams?: Record<string, string>

  /**
   * Prose placed immediately BEFORE the credit components or the clauses --
   * whichever this item uses -- to define a term at its first use.
   *
   * Today this is `olx_prompts.MATCH_DEF`, a table keyed by ITEM ID holding
   * five entries. That is content living in the generator: legitimate as a
   * per-item value, illegitimate as a place for it to live once the rubric is
   * the single source. It arrives here as a field, so the engine never keys on
   * an id (C2) and the rubric owns the words (§2a).
   */
  termDefinition?: string             // 5/26 today, via MATCH_DEF

  /**
   * Credit components to leave OUT of the rendered list.
   *
   * `olx_prompts.OMIT_CREDIT`, currently EMPTY (0 entries). Carried because the
   * generator branches on it and the byte oracle would diverge the moment
   * someone refills it -- not because any item needs it today.
   */
  omitCredit?: string[]               // 0/26 today
  /** Deduction codes to leave out. `OMIT_DEDUCTION`, also empty today. */
  omitDeduction?: string[]            // 0/26 today
  /** Indices of `guidance` lines to suppress. `OMIT_GUIDANCE`: 1c only. */
  omitGuidance?: number[]             // 1/26
  /** Prose appended after guidance, before the checklist. `ITEM_NOTES`. */
  itemNotes?: string                  // 3/26
  /**
   * Per-slot judging text, keyed by slot. Today `olx_prompts.SLOT_NOTES`, 28
   * entries keyed `ITEM:slot` -- the largest body of content still living in
   * the generator, and the one §5.1 already names as the canonical re-point.
   */
  slotNotes?: Record<string, string>  // 28 entries across the corpus

  expect?: ExpectRule[]               // 5/26
  forbid?: ForbidRule[]               // 7/26
  maps?: MapRule[]                    // 4/26
}

/**
 * The assembler's options object.
 *
 * AN OPTIONS OBJECT AND NOT POSITIONAL PARAMETERS, per R8: `scoreSlotSheet`
 * takes eight positional parameters and `satisfiedMap`'s order differs from it,
 * so a caller transposing two gets a wrong score and no error. Naming every
 * input removes that failure mode at the cost of nothing.
 */
/** The parsed sheet attributes the checklist renders as "DO NOT ANSWER" notes. */
export interface ComputedRules {
  counts: CountGroup[]
  equals: Array<{ key: string; left: string; right: string; lenient?: string[] }>
  derived: Array<{ key: string; kind?: string; words?: string[] }>
  choices: Record<string, string[]>
  expect: Array<{ key: string; left: string; value: string; lenient?: string[] }>
  forbid: ForbidRule[]
  maps: Array<MapRule & { fallback?: string }>
}

export interface AssembleOptions {
  item: AssemblerItem
  slots: AssemblerSlot[]
  /** The course-level blurb the system preamble interpolates. */
  blurb: string
  /**
   * Shared prose fragments, supplied by the caller rather than baked in: the
   * 59 module constants the current generator references are content, and
   * content does not live in the engine (C2).
   */
  fragments: Record<string, string>
}

/** What the assembler produces: both halves the build writes into the .olx. */
export interface AssembledItem {
  /** The prompt body, byte-exact against the stage-00 golden. */
  body: string
  /** Generated sheet attributes, e.g. `slots`, `max`, `maps`, `free`. */
  attributes: Record<string, string>
}
