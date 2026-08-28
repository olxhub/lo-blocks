// packages/shared/lib/llm/slotSheet.ts

import PRIMITIVES from './primitives.json';
//
// Slot sheets: turning an authored checklist into a strict JSON Schema, and a
// filled-in checklist back into readable feedback.
//
// A prompt can ask a model to work through a list of checks, but nothing makes
// it finish one — it can answer three of eight and write fluent prose about the
// three. Declaring each check as a REQUIRED property of a strict schema does
// make it finish: an incomplete answer is not well-formed.
//
// Ported from ~/code/molly_scoring, which scores the paper versions of the
// PSYC 1030 behavior-modification handouts against human grading. Both of its
// measurable wins came from moving a checklist out of prose and into the
// schema; three attempts to fix the same items with better prose all failed.
//
// A leaf module on purpose: pure functions, no block/registry/React imports, so
// it can be unit-tested without standing up a runtime.

/** One check the model must answer. */
export type SlotSpec = {
  key: string;
  label: string;
  /** Allowed verdicts. The FIRST is the satisfied one. */
  options: string[];
  /**
   * A gating check: if this one is not satisfied, the rest are moot.
   *
   * Some rubric items have a single finding that costs the whole item rather
   * than one component — a goal behaviour that is a different behaviour
   * altogether, a definition that is correct for the wrong type, an overview
   * that never separates any time periods. Those are one judgement, not the
   * sum of several, and a flat walk cannot express them.
   */
  gates: boolean;
  /**
   * What this check is worth, when the sheet is being graded.
   *
   * Optional, and absent by default: a sheet exists to stop a model skipping
   * checks, which is useful whether or not anything is scored. Points make the
   * sheet gradeable by a grader block; the feedback path ignores them entirely
   * and never shows them.
   */
  pts?: number;
  /**
   * This check is a COUNT, answered 0..countMax, not a judgement.
   *
   * "How many of your three reasons name a negative effect?" is a measurement.
   * It was expressed as a verdict list — `3/2/1/0` — which made the largest
   * number the "satisfied" one by position and left `0/1/2/3` reading as its
   * opposite while meaning the same kind of thing. Neither list was a set of
   * judgements, so neither belonged in `verdict`.
   */
  countMax?: number;
  /**
   * This check is a CLASSIFICATION: it picks one member of a named set,
   * answered in `refers_to`, not a judgement.
   *
   * `PR`, `NR`, `PP`, `NP` are content — the categories an item asks about —
   * not verdicts about content. Routing them through `verdict` forced the
   * satisfied-first convention to double as an answer key, which is why the
   * same question appeared four times with its options permuted. The categories
   * are declared once in `choices=`; which one is expected is stated by an
   * `expect` or `equals` rule, out loud, instead of by list order.
   */
  picks?: string;
};

/**
 * What a judgement may answer when the author adds nothing.
 *
 * Two words, because a verdict answers one question. `unclear` is NOT here: it
 * is an escape hatch, and handing one to every check silently costs points —
 * 24 scored slots deliberately do without it. An item that wants it says so.
 */
export const DEFAULT_VERDICTS = ['met', 'absent'];

/**
 * Verdicts an author may ADD to a judgement, written as the third segment:
 *
 *   key:Label                    met / absent
 *   key:Label:unclear            met / absent / unclear
 *   key:Label:wrong_kind         met / absent / wrong_kind
 *   key:Label:unclear/duplicate  met / absent / unclear / duplicate
 *
 * So `met` and `absent` are never authored, and the extras are drawn from a
 * closed set rather than invented per item. Everything here is a way of NOT
 * being satisfied, except `unclear`, which is a way of declining to say.
 *
 * A third segment whose tokens are not all in this set is read as a legacy
 * FULL list instead — that is how the identity vocabularies (`PR/NR/PP/NP`,
 * `first/second/...`) still parse while they wait to move out of `verdict`.
 * The two forms are unambiguous because `met` and `absent` are never extras.
 */
export const EXTRA_VERDICTS = [
  'unclear',
  'wrong_kind', 'incomplete', 'duplicate', 'mismatch', 'generic', 'tick_values',
];

/**
 * Satisfaction, by name.
 *
 * A verdict answers one question — is the required content present? — so there
 * is one word for yes. Identification ("which of these is it?") and measurement
 * ("how many?") are not verdicts and travel in their own fields; see
 * `refers_to` and `count` below.
 */
export const MET = 'met';

/** Not satisfied, with no more specific reason to give. */
export const ABSENT = 'absent';

/** A failure reason, named so code that decides one can say it. */
export const MISMATCH = 'mismatch';

/** `refers_to` when a check names nothing on its cover group's list. */
export const NONE = 'none';

/**
 * The `checks` payload a filled sheet carries, per check.
 *
 * `refers_to` and `count` are separate fields rather than verdict values
 * because they are not judgements. Asking a check to answer "PR" or "3" through
 * `verdict` forced the satisfied-first convention to encode an answer key —
 * which is why the same question appeared four times with its options permuted.
 * Both are optional and read only by the primitive that needs them.
 */
export type CheckPayload = {
  verdict?: string;
  /** Which item of a cover group's list this check addresses. */
  refers_to?: string;
  /** How many, for a count group's key. */
  count?: number | string;
  evidence?: string;
  note?: string;
};

/**
 * What a verdict token READS AS to the student.
 *
 * The checklist line prints the verdict verbatim, and `showChecks` defaults to
 * true, so whatever a token is spelled becomes student-facing prose. That has
 * been leaking internals: a student who named something that is not an
 * antecedent has been reading
 *
 *   · **First antecedent is a genuine trigger** — not_antecedent
 *
 * Owning the phrasing here rather than in the token is also what makes a shared
 * vocabulary possible at all. Once several items express the same failure, the
 * token can be one canonical name while each item keeps a sentence a student can
 * act on — otherwise the only way to say it well is to invent a per-item token,
 * which is the sprawl this table exists to end.
 *
 * Unknown tokens pass through verbatim. That is deliberate: identity values
 * (`PR`, `first`) are content rather than judgements and read correctly as
 * themselves, and a sheet published before a token was named must still render.
 */
export const VERDICT_DISPLAY: Record<string, string> = {
  // The judgement vocabulary. Mapped to itself for now: these already read as
  // ordinary words, and rewording them changes student-facing text on every
  // item at once. That is a decision to take deliberately, not a side effect of
  // wiring up the table — and when it is taken, it is an edit to this one map.
  met: 'met',
  absent: 'absent',
  unclear: 'unclear',
  yes: 'yes',
  no: 'no',

  // Canonical failure reasons.
  wrong_kind: 'not the kind of thing asked for',
  incomplete: 'named, but not described',
  duplicate: 'repeats an earlier answer',
  mismatch: 'does not match what it should',
  generic: "still the example's wording",
  tick_values: "these are the axis's values, not a label",

  // Item-local reasons the content migration retires into the canonical set
  // above. Kept because sheets already published carry them, and because an
  // unmigrated item should read well in the meantime.
  not_antecedent: 'not an antecedent',
  not_active: 'not something done during the behavior',
  not_consequence: 'not a consequence',
  not_reason: 'not a reason',
  not_described: 'named, but not described',
};

/** A verdict as the student should read it. Unknown tokens pass through. */
export function displayVerdict(token: unknown): string {
  const t = String(token ?? '').trim();
  if (!t) return '';
  return VERDICT_DISPLAY[t] ?? t;
}

/**
 * A set of checks that between them must COVER a set of labels.
 *
 * Some rubrics ask whether two answers correspond to two named things without
 * caring which is which — "change each of your two antecedents" does not require
 * them in the order 4a listed. Asking the model "does this box match?" bundles
 * two jobs: identifying WHICH thing the box names, and deciding whether the pair
 * covers both. The second is arithmetic and belongs here; leaving it in the
 * prompt makes correctness depend on the model reasoning about its own other
 * answers, which is a needless source of variance.
 *
 * So the model reports identity — `first`, `second`, `neither` — and this decides
 * satisfaction: a check is satisfied when it names one of the required labels and
 * no earlier check in the group has already claimed that label. Order-independent
 * by construction, and double-naming is unrepresentable rather than merely
 * discouraged.
 */
export type CoverGroup = { keys: string[]; labels: string[] };

/**
 * A check the grader COMPUTES by comparing two other checks, rather than asking.
 *
 * The clearest case: an item asks the model which of four types an example
 * actually is (`observed_type`) and which the student said they would use
 * (`named_type`), and then asks a third check whether they match. The model has
 * already supplied both operands; making it answer the comparison as well adds a
 * judgement it cannot get more right than the arithmetic can, and can get wrong.
 *
 * A computed check is left OUT of the response schema — asking for an answer that
 * is then discarded is the same incoherence as listing a criterion with no slot —
 * and its verdict is synthesised for display.
 */
export type EqualsRule = {
  key: string;
  left: string;
  right: string;
  /**
   * Operand values that mean "cannot tell", which SATISFY the check rather than
   * failing it.
   *
   * Required for faithfulness, not convenience. The rubric this models guards its
   * deduction with `named != "unclear" && observed != named` — it will not charge
   * a mismatch it cannot establish. Without this list a `unclear` operand would
   * simply be unequal to a real type and the check would fail, which is a
   * deduction the rubric does not make.
   */
  lenient: string[];
};

/**
 * A check that is only CHARGED when another check is satisfied.
 *
 * Some rubrics charge one deduction for either of two causes, never twice. The
 * case here: an example of the wrong type loses 2, and so does a right-type
 * example aimed at the wrong behaviour — but a wrong-type example aimed at the
 * wrong behaviour still loses only 2, because the second finding is already
 * accounted for by the first. (`score.py:derive_oc_ledger` writes that as
 * `if observed != expected: ... elif not aimed: ...`.)
 *
 * Two independently-scored checks cannot express that: they charge 4. The
 * alternative tried first was to tell the model to report `yes` when the
 * condition did not hold, which buys the arithmetic by asking for a verdict that
 * is false about the student's answer — and that verdict is shown to the student.
 *
 * So satisfaction stays HONEST and only the charge is suppressed. That is also
 * how the rubric does it: its check list records the real value while its ledger
 * declines to bill for it, which is why this is not a `satisfiedMap` concern.
 */
/**
 * A check that FAILS when a named COMBINATION of other answers holds.
 *
 * `equals` asks whether two answers agree and `expect` compares one against an
 * authored value; neither can say "fail when A is this AND B is that". Written
 * as one slot instead, the question becomes composite — and composite is how the
 * rule this replaces already failed, four times over. Asked of one answer at a
 * time it stayed stable; asked as a single judgement the model resolved the
 * tension by re-reading which clause was which.
 *
 * The case it was added for: a deprivation the plan CREATES is not by itself a
 * fault, because an ordinary punishment contingency creates one too. It is a
 * fault only when the student's own SUCCESS is what lifts it, since then the
 * deprivation stands in front of the behaviour rather than following it. Over 216
 * measured cell-runs, `created` alone ran 24 gold-0 against 67 gold->0, while
 * `created` together with success-lifts-it ran 13 against 1.
 *
 * Each operand stays a separate question the model answers on its own; the
 * conjunction is arithmetic done here.
 *
 * An unanswered operand means the combination cannot be ESTABLISHED, so the check
 * PASSES. A gate must not fire on missing data: a false zero costs a whole item.
 */
/**
 * `behavior_1->not_active` — a computed rule may NAME the verdict it sets when it
 * fails, instead of the verdict being positional.
 *
 * Positional was not merely awkward, it was ambiguous, and the two python engines
 * resolved it differently: one took the LAST option of the slot's vocabulary and
 * the other the SECOND. Every computed check in the current content has exactly
 * two options, so those coincide and the three implementations agreed by luck; the
 * disagreement appears on the first three-option computed check.
 *
 * This runtime scores a computed check by whether it is satisfied and charges its
 * points, with no verdict-to-code mapping of its own, so `fails` changes nothing
 * about what a student is charged HERE. It is parsed and carried because the key
 * must resolve: without stripping the arrow the key would read
 * `behavior_1->not_active`, no slot would match it, and the check it names would
 * silently never be computed.
 */
export function splitFailsVerdict(key: string): { key: string; fails?: string } {
  const i = key.indexOf('->');
  if (i < 0) return { key: key.trim() };
  const fails = key.slice(i + 2).trim();
  return { key: key.slice(0, i).trim(), ...(fails ? { fails } : {}) };
}

export type ForbidRule = { key: string; fails?: string; conds: { slot: string; value: string }[] };

export type OnlyIfRule = { key: string; cond: string };

/**
 * `requires="key:condition"` — `key` can only be CREDITED while `condition`
 * holds. The mirror image of `onlyif`, which decides what may be CHARGED.
 *
 * Q6 is why it exists. Its eight slots are four (element, treatment) pairs, and
 * the sheet asked each box whether its consequence was named and whether an
 * effect was described — but never which antecedent's change PRODUCES that
 * effect. A response addressing one antecedent in a single run-on sentence
 * therefore banked both consequence pairs from one clause, where the graders
 * charged the whole second half. Asking the linkage as its own check gives
 * `cover` a duplicate to spot; `requires` is what lets that answer reach the
 * pair it governs, which is scored on other slots.
 */
export type RequiresRule = { key: string; cond: string; lenient: string[] };

/**
 * Parse a `requires` attribute: rules separated by `|`, each `key:condition`.
 *
 *   requires="state_c2:link_c2:unclear|affect_c2:link_c2:unclear"
 *
 * The optional third segment lists verdicts on the CONDITION that establish
 * nothing either way, and so deny nothing — the same `lenient` the `equals` and
 * `expect` rules carry, for the same reason. A condition answered `unclear` is
 * the model declining to say; reading that as a denial charges the student for
 * the grader's hesitation.
 */
export function parseRequires(spec?: string): RequiresRule[] {
  return (spec ?? '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.split(':').map(p => (p ?? '').trim());
      return {
        key: parts[0], cond: parts[1],
        lenient: (parts[2] ?? '').split(',').map(v => v.trim()).filter(Boolean),
      };
    })
    .filter(r => r.key && r.cond);
}

/**
 * Parse an `onlyif` attribute: rules separated by `|`, each `key:condition`.
 *
 *   onlyif="targets_goal_behavior:observed_type"
 */
export function parseOnlyIf(spec?: string): OnlyIfRule[] {
  return (spec ?? '')
    .split('|')
    .map(r => r.trim())
    .filter(Boolean)
    .map(entry => {
      const [key, cond] = entry.split(':').map(p => (p ?? '').trim());
      return { key, cond };
    })
    .filter(r => r.key && r.cond);
}

/**
 * Which checks may be charged: everything except those whose condition failed.
 *
 * Conditions are read from `sat`, so a condition may itself be a cover or
 * computed check. Chaining is deliberately NOT transitive — a rule names one
 * condition and that condition's own suppression does not propagate, because
 * nothing in these rubrics needs it and a silent transitive closure would be
 * hard to predict from the attribute.
 */
export function chargedMap(
  slots: SlotSpec[],
  sat: Record<string, boolean>,
  onlyif: OnlyIfRule[] = [],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const s of slots) out[s.key] = true;
  for (const r of onlyif) {
    // An unknown condition suppresses nothing: a typo in the attribute must not
    // silently stop a check being charged.
    if (!(r.cond in sat)) continue;
    out[r.key] = sat[r.cond];
  }
  return out;
}

/**
 * A repeated element counted ONCE, with the member checks derived from the count.
 *
 * Some rubrics award a point per instance of something and tell the grader to count
 * generously — Handout 1's "three separate reasons" counts thematically related
 * statements separately. Asked as three independent checks, "is there a THIRD
 * distinct reason?" is a harder and less stable judgement than "how many are
 * there", and the deduction it drives is a count either way. So the model answers
 * the count and this awards that many members.
 *
 * The members leave the response schema, like any derived check: asking for an
 * answer that is then overwritten is the incoherence the whole family avoids.
 */
export type CountGroup = { key: string; slots: string[] };

/**
 * Parse a `counts` attribute: groups separated by `|`, each `key:member,member`.
 *
 *   counts="reasons_given:reason_1,reason_2,reason_3"
 */
export function parseCounts(spec?: string): CountGroup[] {
  return (spec ?? '')
    .split('|')
    .map(g => g.trim())
    .filter(Boolean)
    .map(entry => {
      const [key, members] = entry.split(':').map(p => (p ?? '').trim());
      return { key, slots: (members ?? '').split(',').map(m => m.trim()).filter(Boolean) };
    })
    .filter(g => g.key && g.slots.length > 0);
}

/** Member verdicts implied by a count: the first N are met, the rest absent. */
export function countedVerdicts(
  counts: CountGroup[],
  checks: Record<string, CheckPayload | undefined>,
): Record<string, { verdict: string }> {
  const out: Record<string, { verdict: string }> = {};
  for (const g of counts) {
    // `count` where the item has been migrated, `verdict` where it has not.
    // Read per check rather than per sheet so the two can coexist while the
    // content moves over item by item.
    const src = checks[g.key]?.count ?? checks[g.key]?.verdict ?? '';
    const raw = String(src).trim();
    const n = Number.parseInt(raw, 10);
    const got = Number.isFinite(n) ? n : 0;
    g.slots.forEach((k, i) => { out[k] = { verdict: i < got ? 'met' : 'absent' }; });
  }
  return out;
}

/**
 * A check whose verdict comes from the STATE OF THE PAGE, not from the model.
 *
 * Some rubric checks are about what the student supplied rather than what they
 * wrote. Handout 3 asks whether they produced a graph of their own data; on the
 * web that graph is drawn from four data fields, so "is there a graph" is a
 * property of those fields — the renderer already knows the answer, and asking a
 * model to look at the picture and guess is strictly worse.
 *
 * This module stays a leaf: it does not know how such a verdict is obtained,
 * only that the model is not asked for it. The block computes the value and puts
 * it in `checks` alongside the answered ones; everything downstream — scoring,
 * gating, feedback — treats it as an ordinary verdict.
 */
export type DerivedRule = {
  key: string;
  /**
   * HOW the verdict is obtained. Explicit on every rule rather than inferred,
   * because there is now more than one way and a silently-guessed one would
   * misgrade rather than fail: `plots` reads typed numbers through the chart's own
   * parser, `present` asks only whether the field holds anything at all (a closed
   * choice has nothing to parse).
   */
  kind: string;
  targets: string[];
  /**
   * Data that means "this is not yours" — one list of numbers per target.
   *
   * Handout 3 puts a worked example on the same screen as the boxes, so a student
   * can type ITS numbers and get its chart back. That is the live form of the
   * paper item's "left the template in place" failure, and it is a comparison of
   * numbers, not a judgement: the prompt used to hand the model the example's
   * data and ask it to recognise them. Empty when an item has no such case.
   */
  template: number[][];
};

/**
 * Parse a `derived` attribute: rules separated by `|`, each `key:ref,ref`.
 *
 * Each rule is `key:kind:refs` with an optional kind-specific tail:
 *
 *   derived="type_stated:present:bmod_h2_t1"
 *   derived="baseline_data:plots:bmod_h3_baseline"
 *   derived="has_own_graph:plots:fieldA,fieldB:1,2,3;4,5,6"   (template data)
 *
 * A rule naming an unknown kind is DROPPED, and `DerivedChecks` then reports the
 * scored check that has no rule — an author error surfaced where it is visible,
 * rather than a check that quietly scores as unmet.
 */
// From the shared registry — see primitives.json for why it is shared.
export const DERIVED_KINDS: string[] =
  (PRIMITIVES.primitives.find(p => p.attr === 'derived')?.kinds ?? []);
export function parseDerived(spec?: string): DerivedRule[] {
  return (spec ?? '')
    .split('|')
    .map(r => r.trim())
    .filter(Boolean)
    .map(entry => {
      const [key, kind, refs, tmpl] = entry.split(':').map(p => (p ?? '').trim());
      return {
        key,
        kind,
        targets: (refs ?? '').split(',').map(t => t.trim()).filter(Boolean),
        // Empty tokens are dropped BEFORE Number(), because Number('') is 0 —
        // an absent template would otherwise parse as [[0]] and could match a
        // student who typed a single zero.
        template: (tmpl ?? '')
          .split(';')
          .map(g => g.split(',').map(n => n.trim()).filter(Boolean)
                     .map(Number).filter(Number.isFinite))
          .filter(g => g.length > 0),
      };
    })
    .filter(r => r.key && DERIVED_KINDS.includes(r.kind) && r.targets.length > 0);
}

/**
 * Parse an `equals` attribute: rules separated by `|`, each
 * `key:left,right` or `key:left,right:lenient,values`.
 */
export function parseEquals(spec?: string): EqualsRule[] {
  return (spec ?? '')
    .split('|')
    .map(r => r.trim())
    .filter(Boolean)
    .map(entry => {
      const [key, operands, lenient] = entry.split(':').map(p => (p ?? '').trim());
      const [left, right] = (operands ?? '').split(',').map(p => (p ?? '').trim());
      return {
        key, left, right,
        lenient: (lenient ?? '').split(',').map(p => p.trim()).filter(Boolean),
      };
    })
    .filter(r => r.key && r.left && r.right);
}

/**
 * Parse a `forbid` attribute: rules separated by `|`, each
 * `key:slot=value,slot=value`. The check fails only when EVERY condition holds.
 *
 *   forbid="consequence_not_a_setup:restriction_authored=created,trigger_expects=gain"
 */
export function parseForbid(spec?: string): ForbidRule[] {
  return (spec ?? '')
    .split('|')
    .map(r => r.trim())
    .filter(Boolean)
    .map(entry => {
      const idx = entry.indexOf(':');
      const { key, fails } = splitFailsVerdict(idx < 0 ? entry : entry.slice(0, idx));
      const conds = (idx < 0 ? '' : entry.slice(idx + 1))
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => {
          const [slot, value] = c.split('=').map(x => (x ?? '').trim());
          return { slot, value };
        })
        .filter(c => c.slot && c.value);
      return { key, conds, ...(fails ? { fails } : {}) };
    })
    .filter(r => r.key && r.conds.length > 0);
}

/** Whether a forbid rule's combination is established by the answers given. */
export function forbidden(
  rule: ForbidRule,
  checks: Record<string, CheckPayload | undefined>,
): boolean {
  return rule.conds.every(c => {
    // A classification answers `refers_to`; only an unmigrated slot spells it as
    // the verdict. Reading the verdict alone made this never fire on the pick
    // slots it exists for — the same bug `equals` had, caught here by the
    // enforcement probe before the rule was ever measured.
    const v = String(checks[c.slot]?.refers_to ?? checks[c.slot]?.verdict ?? '').trim();
    return !!v && v === c.value;
  });
}

/** The verdict a computed check gets, for display and for the published sheet. */
export function computedVerdict(
  rule: EqualsRule,
  checks: Record<string, CheckPayload | undefined>,
): string {
  const l = (checks[rule.left]?.verdict ?? '').trim();
  const r = (checks[rule.right]?.verdict ?? '').trim();
  if (rule.lenient.includes(l) || rule.lenient.includes(r)) return 'not established';
  if (!l || !r) return 'not reported';
  return l === r ? 'matches' : `${l} vs ${r}`;
}

/**
 * Parse a `cover` attribute: groups separated by `|`, each `key,key:label,label`.
 *
 *   cover="state_a1,state_a2:first,second|state_c1,state_c2:first,second"
 */
export function parseCover(spec?: string): CoverGroup[] {
  return (spec ?? '')
    .split('|')
    .map(g => g.trim())
    .filter(Boolean)
    .map(entry => {
      const [rawKeys, rawLabels] = entry.split(':').map(p => (p ?? '').trim());
      return {
        keys: (rawKeys ?? '').split(',').map(s => s.trim()).filter(Boolean),
        labels: (rawLabels ?? '').split(',').map(s => s.trim()).filter(Boolean),
      };
    })
    .filter(g => g.keys.length > 0 && g.labels.length > 0);
}

/** Satisfaction for every check, with cover groups overriding the first-verdict rule. */
export function satisfiedMap(
  slots: SlotSpec[],
  checks: Record<string, CheckPayload | undefined>,
  cover: CoverGroup[] = [],
  equals: EqualsRule[] = [],
  counts: CountGroup[] = [],
  expect: ExpectRule[] = [],
  requires: RequiresRule[] = [],
  forbid: ForbidRule[] = [],
  maps: MapsRule[] = [],
): Record<string, boolean> {
  // Counted members first: they are derived from the count, so whatever the model
  // may have sent for them is replaced before anything reads it.
  if (counts.length) checks = { ...checks, ...countedVerdicts(counts, checks) };
  const out: Record<string, boolean> = {};
  for (const s of slots) out[s.key] = isSatisfied(s, checks[s.key]?.verdict);
  // A computed check is satisfied when its two operands agree. Both must have
  // been answered: an unanswered operand cannot establish a match, so the check
  // fails rather than passing by default.
  for (const r of equals) {
    // A classification answers `refers_to`; an unmigrated slot still spells it
    // as the verdict. Same fallback `cover` uses, for the same reason.
    const l = String(checks[r.left]?.refers_to ?? checks[r.left]?.verdict ?? '').trim();
    const rt = String(checks[r.right]?.refers_to ?? checks[r.right]?.verdict ?? '').trim();
    const cannotTell = r.lenient.includes(l) || r.lenient.includes(rt);
    out[r.key] = cannotTell || (!!l && !!rt && l === rt);
  }
  // Same shape as `equals`, one operand being an authored constant instead of a
  // second check. Lenient members satisfy without establishing a match.
  for (const r of expect) {
    const got = String(checks[r.left]?.refers_to ?? checks[r.left]?.verdict ?? '').trim();
    out[r.key] = r.lenient.includes(got) || (!!got && got === r.value);
  }

  const byKeySpec = new Map(slots.map(s => [s.key, s]));
  // A forbidden combination fails the check; anything else passes, an
  // unanswered operand included.
  for (const r of forbid) out[r.key] = !forbidden(r, checks);
  // `maps` last of the computed three, so a mapped check may read a pick that an
  // earlier rule wrote. It resolves to a VERDICT and is reduced to satisfied/not
  // through the same isSatisfied the model-answered slots use, so a mapped
  // `not_active` and an answered `not_active` are the same thing here.
  for (const r of maps) {
    const spec = byKeySpec.get(r.key);
    const v = mappedVerdict(r, checks);
    out[r.key] = spec ? isSatisfied(spec, v) : false;
  }
  for (const g of cover) {
    const claimed = new Set<string>();
    for (const k of g.keys) {
      // Which item of the list this check addresses. `refers_to` once the item
      // is migrated; `verdict` while it still spells the reference as a verdict.
      const migrated = checks[k]?.refers_to !== undefined;
      const v = String(checks[k]?.refers_to ?? checks[k]?.verdict ?? '').trim();
      const ok = g.labels.includes(v) && !claimed.has(v);
      if (ok) claimed.add(v);
      // Once the two are separate fields, BOTH have to hold: naming a distinct
      // item of the list is not enough if the check also says nothing was
      // answered. While the reference IS the verdict there is only one thing to
      // read, so the legacy path is left exactly as it was.
      const spec = byKeySpec.get(k);
      const judged = migrated && spec ? isSatisfied(spec, checks[k]?.verdict) : true;
      out[k] = ok && judged;
    }
  }

  // `requires` last, so a dependency may name a cover or computed check: those
  // are already resolved above. The mirror image of `onlyif` — that one decides
  // what may be CHARGED once a condition failed, this one decides what may be
  // CREDITED — and non-transitive for the same reason, so a chain of two reads
  // the way the attribute looks.
  for (const r of requires) {
    if (!(r.cond in out)) continue;   // unknown condition denies nothing
    const answered = String(checks[r.cond]?.verdict ?? '').trim();
    if (r.lenient.includes(answered)) continue;   // establishes nothing
    if (r.key in out) out[r.key] = out[r.key] && out[r.cond];
  }
  return out;
}

/**
 * Parse an authored `slots` attribute.
 *
 * Entries are separated by `|`; each is `key:Label` or `key:Label:opt1/opt2`.
 * A leading `!` on the key marks it as gating. A trailing `@n` gives the check a
 * point value for grading — `utb_stated:Behavior stated@2`. Labels may contain
 * commas (the verdict list is a separate attribute) but not colons, since the
 * colon separates the fields.
 */
/**
 * The third segment of a slot, as an option list.
 *
 * Absent → the default judgement. All-extras → the judgement plus those extras.
 * Anything else → a legacy full list, taken verbatim.
 */
/**
 * Named sets of categories an item asks about — authored content, declared once.
 *
 *   choices="operant_type:PR,NR,PP,NP,none|which_of_two:first,second"
 *
 * A set is referenced by `pick(name)` on as many slots as need it, so the four
 * screens that ask about operant conditioning share one declaration instead of
 * restating the categories (and, previously, restating them in four different
 * orders).
 */
export function parseChoices(spec?: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const grp of (spec ?? '').split('|')) {
    const [name, members] = grp.split(':').map(x => (x ?? '').trim());
    const vals = (members ?? '').split(',').map(v => v.trim()).filter(Boolean);
    if (name && vals.length) out[name] = vals;
  }
  return out;
}

/** `pick(operant_type)` -> "operant_type", for a segment that classifies. */
export function parsePick(segment: string | undefined): string | undefined {
  const m = /^pick\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/.exec((segment ?? '').trim());
  return m ? m[1] : undefined;
}

/**
 * A check COMPUTED by comparing one classification against an AUTHORED value.
 *
 *   expect="matches_screen:observed_type=PR:none"
 *          key            :left        =value:lenient…
 *
 * The counterpart to `equals`, which compares two classifications. This one
 * names the expected answer explicitly — the thing that used to be expressed by
 * putting it first in a verdict list. `lenient` members satisfy the check
 * without establishing a match, the same way they do for `equals`: a category
 * nobody could determine is not a mismatch to charge.
 */
export type ExpectRule = { key: string; fails?: string; left: string; value: string; lenient: string[] };

export function parseExpect(spec?: string): ExpectRule[] {
  const out: ExpectRule[] = [];
  for (const rule of (spec ?? '').split('|')) {
    const parts = rule.split(':').map(x => x.trim());
    if (parts.length < 2) continue;
    const [rawKey, lhs, len] = parts;
    const { key, fails } = splitFailsVerdict(rawKey ?? '');
    const eq = lhs.indexOf('=');
    if (!key || eq < 0) continue;
    const left = lhs.slice(0, eq).trim();
    const value = lhs.slice(eq + 1).trim();
    if (!left || !value) continue;
    out.push({ key, left, value, ...(fails ? { fails } : {}),
               lenient: (len ?? '').split(',').map(v => v.trim()).filter(Boolean) });
  }
  return out;
}

/** `count(3)` -> 3, for a segment that declares a measurement. */
export function parseCountMax(segment: string | undefined): number | undefined {
  const m = /^count\(\s*(\d+)\s*\)$/.exec((segment ?? '').trim());
  return m ? Number(m[1]) : undefined;
}

export function resolveOptions(segment: string | undefined, defaults: string[]): string[] {
  if (parseCountMax(segment) !== undefined) return [];   // a measurement
  if (parsePick(segment) !== undefined) return [];       // a classification
  const tokens = (segment ?? '').split('/').map(o => o.trim()).filter(Boolean);
  if (!tokens.length) return defaults;
  if (tokens.every(t => EXTRA_VERDICTS.includes(t))) {
    return [...DEFAULT_VERDICTS, ...tokens];
  }
  return tokens;
}

export function parseSlots(spec: string, defaults: string[] = DEFAULT_VERDICTS): SlotSpec[] {
  return (spec ?? '')
    .split('|')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      // Points come off the end first, so a label may contain anything else.
      let pts: number | undefined;
      const at = /@(-?\d+(?:\.\d+)?)\s*$/.exec(entry);
      if (at) {
        pts = Number(at[1]);
        entry = entry.slice(0, at.index).trim();
      }
      const [rawKey, label, opts] = entry.split(':').map(part => (part ?? '').trim());
      const gates = rawKey.startsWith('!');
      const key = gates ? rawKey.slice(1).trim() : rawKey;
      const slot: SlotSpec = {
        key,
        label: label || key,
        options: resolveOptions(opts, defaults),
        gates,
      };
      if (pts !== undefined) slot.pts = pts;
      const countMax = parseCountMax(opts);
      if (countMax !== undefined) slot.countMax = countMax;
      const picks = parsePick(opts);
      if (picks !== undefined) slot.picks = picks;
      return slot;
    })
    .filter(slot => slot.key.length > 0
                 && (slot.options.length > 0
                     || slot.countMax !== undefined
                     || slot.picks !== undefined));
}

/**
 * Score a filled sheet: the total, minus what each unsatisfied check costs.
 *
 * `@n` is what an unmet check COSTS, not what a met one earns, and `explicitMax`
 * is the item's total. The distinction only shows up on rubrics whose deductions
 * can exceed the item — "not operant conditioning" costs 4 on a 4-point item
 * that also charges 2 for the wrong type and 1 for the wrong behaviour. Those
 * are applied and clamped, so the costs deliberately do not sum to the max.
 *
 * Where they do sum to it — every additive item, which is most of them — the two
 * readings coincide and `explicitMax` can be omitted.
 *
 * Returns null when the sheet carries no point values, which is the default: a
 * sheet is for forcing checks, and only becomes gradeable when an author
 * attaches costs. A failed gating check costs the whole item, matching how a
 * single finding can void a rubric item outright.
 */
/**
 * The sheet as PUBLISHED to a target's `checks` field.
 *
 * Two blocks write this — LLMAction after a call, DerivedChecks from an effect —
 * and two things read it: SlotSheetGrader, and any harness measuring the app
 * against gold. One builder so the writers cannot drift apart, which they had
 * already started to: only one of them recorded whether the checks were shown.
 *
 * Empty primitive groups are omitted, because absent and empty mean the same
 * thing for them. `showChecks` is always written: a reader cannot otherwise
 * tell "shown, author took the default" from "written before this key existed".
 */
export function publishedSheet(args: {
  slots: SlotSpec[];
  verdicts: Record<string, unknown>;
  showChecks: boolean;
  max?: unknown;
  cover?: CoverGroup[];
  equals?: EqualsRule[];
  onlyif?: OnlyIfRule[];
  counts?: CountGroup[];
  choices?: Record<string, string[]>;
  expect?: ExpectRule[];
  requires?: RequiresRule[];
  forbid?: ForbidRule[];
  maps?: MapsRule[];
}): Record<string, unknown> {
  const { slots, verdicts, showChecks, max } = args;
  const cover = args.cover ?? [], equals = args.equals ?? [];
  const onlyif = args.onlyif ?? [], counts = args.counts ?? [];
  // Carried so a stored sheet re-scores by the rules in force when it was
  // written — the property that makes old sheets immune to a vocabulary change.
  const choices = args.choices ?? {}, expect = args.expect ?? [];
  const requires = args.requires ?? [];
  const forbid = args.forbid ?? [];
  return {
    slots,
    ...(cover.length ? { cover } : {}),
    ...(equals.length ? { equals } : {}),
    ...(onlyif.length ? { onlyif } : {}),
    ...(counts.length ? { counts } : {}),
    ...(Object.keys(choices).length ? { choices } : {}),
    ...(expect.length ? { expect } : {}),
    ...(requires.length ? { requires } : {}),
    ...(forbid.length ? { forbid } : {}),
    showChecks,
    verdicts,
    ...(max !== undefined && max !== null && String(max) !== ''
      ? { max: Number(max) }
      : {}),
  };
}

export function scoreSlotSheet(
  slots: SlotSpec[],
  checks: Record<string, CheckPayload | undefined>,
  explicitMax?: number,
  cover: CoverGroup[] = [],
  equals: EqualsRule[] = [],
  onlyif: OnlyIfRule[] = [],
  counts: CountGroup[] = [],
  expect: ExpectRule[] = [],
  requires: RequiresRule[] = [],
  forbid: ForbidRule[] = [],
  maps: MapsRule[] = [],
): { score: number; max: number; failed: string[] } | null {
  const scored = slots.filter(s => typeof s.pts === 'number');
  if (scored.length === 0 && explicitMax === undefined) return null;
  const max = explicitMax ?? scored.reduce((n, s) => n + (s.pts as number), 0);
  const sat = satisfiedMap(slots, checks, cover, equals, counts, expect, requires, forbid, maps);
  const charged = chargedMap(slots, sat, onlyif);

  const gate = failedGate(slots, checks, cover, equals, onlyif, counts, expect, requires, forbid, maps);
  if (gate) return { score: 0, max, failed: [gate.key] };

  const failed = scored.filter(s => !sat[s.key] && charged[s.key]);
  const lost = failed.reduce((n, s) => n + (s.pts as number), 0);
  return {
    score: Math.max(0, Math.min(max, max - lost)),
    max,
    failed: failed.map(s => s.key),
  };
}

/**
 * `maps="key:pick:value>verdict,...,*>verdict"` — a check COMPUTED by mapping one
 * pick's value to a NAMED verdict.
 *
 * The primitive the other three could not express. `equals`, `expect` and `forbid`
 * each produce a check with ONE failing verdict, because each answers a yes/no
 * question about other answers. A check with more than one kind of failure cannot
 * be derived that way, and Q4b's `behavior_*` is exactly that: `absent` means the
 * box was empty and charges "you only gave one example", while `not_active` means
 * something is there but is not an activity done instead of the goal behaviour, and
 * charges a repeatable deduction. Two different things to tell a student.
 *
 * Writing it as two `forbid` rules on one key does not work and fails DANGEROUSLY:
 * every implementation ASSIGNS the computed check per rule, so the last rule wins
 * and an earlier failure is overwritten back to satisfied — a wrong entry would be
 * credited.
 *
 * `*` is the fallback. A pick value with no pair and no fallback leaves the check
 * unmapped rather than guessing, which surfaces as unsatisfied here and as an
 * audit finding in the scoring repo.
 */
export type MapsRule = {
  key: string;
  pick: string;
  pairs: { value: string; verdict: string }[];
  fallback?: string;
};

export function parseMaps(spec?: string): MapsRule[] {
  const out: MapsRule[] = [];
  for (const rule of (spec ?? '').split('|')) {
    const parts = rule.split(':').map(x => x.trim());
    if (parts.length < 3) continue;
    const [key, pick, rawPairs] = parts;
    if (!key || !pick) continue;
    const pairs: { value: string; verdict: string }[] = [];
    let fallback: string | undefined;
    for (const pair of (rawPairs ?? '').split(',')) {
      const i = pair.indexOf('>');
      if (i < 0) continue;
      const value = pair.slice(0, i).trim();
      const verdict = pair.slice(i + 1).trim();
      if (!value || !verdict) continue;
      if (value === '*') fallback = verdict;
      else pairs.push({ value, verdict });
    }
    if (pairs.length || fallback) out.push({ key, pick, pairs, ...(fallback ? { fallback } : {}) });
  }
  return out;
}

/** The verdict a maps rule assigns, or undefined when nothing matches. */
export function mappedVerdict(
  rule: MapsRule,
  checks: Record<string, CheckPayload | undefined>,
): string | undefined {
  // A classification answers `refers_to`; an unmigrated slot spells it as the
  // verdict. Same read as `equals`, `expect` and `forbid` use on their operands.
  const got = String(checks[rule.pick]?.refers_to ?? checks[rule.pick]?.verdict ?? '').trim();
  if (!got) return undefined;
  const hit = rule.pairs.find(p => p.value === got);
  return hit ? hit.verdict : rule.fallback;
}

/**
 * Is this slot satisfied?
 *
 * By NAME where the slot uses the judgement vocabulary, and by POSITION
 * otherwise. The two rules agree on every slot in the current content — no
 * vocabulary in the handouts carries `met` anywhere but first — so this is a
 * behaviour-preserving change that stops satisfaction depending on the order an
 * author happened to write the options in.
 *
 * The positional branch is what still reads the identity vocabularies
 * (`PR/NR/PP/NP`, `first/second/...`), and it goes away with them.
 */
export function isSatisfied(slot: SlotSpec, verdict: string | undefined): boolean {
  const v = (verdict ?? '').trim();
  if (!v) return false;
  if (slot.options.includes(MET)) return v === MET;
  return v === slot.options[0];
}

/**
 * The first gating slot that failed, if any.
 *
 * A gate whose `onlyif` condition did not hold does not fire: it is moot, and a
 * moot finding that voids the whole item is the double-charge this exists to
 * prevent, in its most expensive form.
 */
export function failedGate(
  slots: SlotSpec[],
  checks: Record<string, CheckPayload | undefined>,
  cover: CoverGroup[] = [],
  equals: EqualsRule[] = [],
  onlyif: OnlyIfRule[] = [],
  counts: CountGroup[] = [],
  expect: ExpectRule[] = [],
  requires: RequiresRule[] = [],
  forbid: ForbidRule[] = [],
  maps: MapsRule[] = [],
): SlotSpec | null {
  const sat = satisfiedMap(slots, checks, cover, equals, counts, expect, requires, forbid, maps);
  const charged = chargedMap(slots, sat, onlyif);
  for (const slot of slots) {
    if (slot.gates && !sat[slot.key] && charged[slot.key]) return slot;
  }
  return null;
}

/**
 * Build the strict schema for a slot sheet.
 *
 * `checks` is declared BEFORE `feedback` deliberately. Properties are generated
 * in order, so the model reaches its verdicts before writing the prose the
 * student reads, and the prose is conditioned on the checklist rather than
 * rationalised after it.
 */
export function buildSlotSchema(
  slots: SlotSpec[],
  equals: EqualsRule[] = [],
  derived: DerivedRule[] = [],
  counts: CountGroup[] = [],
  // When the student will SEE the checklist, each check also carries the
  // sentence they read about it, so the feedback can be shown beside the check
  // it belongs to instead of as a paragraph they have to map onto a tick list
  // themselves. A schema property rather than an instruction to write bullets:
  // the same reason the checklist itself is one — a required property is
  // answered, a request in prose is answered when convenient.
  perCheckNotes = false,
  // Cover groups, so a member can be asked WHICH item of the list it addresses.
  cover: CoverGroup[] = [],
  // Named category sets, and the rules that compare a pick against a constant.
  choices: Record<string, string[]> = {},
  expect: ExpectRule[] = [],
  forbid: ForbidRule[] = [],
  maps: MapsRule[] = [],
): Record<string, unknown> {
  const computed = new Set([...equals.map(r => r.key), ...derived.map(r => r.key),
                            ...counts.flatMap(g => g.slots), ...expect.map(r => r.key),
                            ...forbid.map(r => r.key)]);
  // Which list each cover member has to choose from. The enum is the group's
  // own labels, so this generalises to any number of them — two, or twelve —
  // without the engine knowing how many. `none` is always available: "I named
  // something, but not one of these" is a real answer and used to be spelled by
  // adding a `neither` to the verdict list.
  const coverOf = new Map<string, string[]>();
  for (const g of cover) for (const k of g.keys) coverOf.set(k, [...g.labels, NONE]);
  // A classification draws from its named set verbatim: `none`/`unclear` are
  // members of the set when the author wants them, not additions made here.
  for (const slot of slots) {
    if (slot.picks && choices[slot.picks]) coverOf.set(slot.key, choices[slot.picks]);
  }
  const properties: Record<string, unknown> = {};
  for (const slot of slots) {
    if (computed.has(slot.key)) continue;   // the grader derives this one
    properties[slot.key] = {
      type: 'object',
      properties: {
        ...(coverOf.has(slot.key) ? {
          refers_to: {
            type: 'string', enum: coverOf.get(slot.key),
            description:
              'WHICH item of the list above this one addresses, or "none". This ' +
              'is not a judgement — the verdict says whether they answered, this ' +
              'says what they answered ABOUT. Two checks naming the same item is ' +
              'the error it exists to catch, so do not use one twice.',
          },
        } : {}),
        ...(slot.countMax !== undefined
          // A measurement, so an integer with the range it can take. Asking for
          // it as one of "3"/"2"/"1"/"0" invited the model to treat the first
          // listed as the good answer, which is what a verdict list means
          // everywhere else in the sheet.
          ? { count: { type: 'integer', minimum: 0, maximum: slot.countMax,
                       description: 'How many. A number, not a judgement.' } }
          : slot.picks !== undefined
            ? {}                       // answers `refers_to` only; see coverOf
            : { verdict: { type: 'string', enum: slot.options } }),
        evidence: {
          type: 'string',
          description: perCheckNotes
            // Displayed under this check when the checklist is shown, so it is
            // read by the student, not only by whoever audits the sheet.
            ? 'SHOWN TO THE STUDENT under this check. Quote their own words — the ' +
              'shortest span that settles this check, verbatim and in quotation ' +
              'marks. If there is nothing to quote, say briefly what you looked ' +
              'for and did not find. Never write "None".'
            : 'Quote from the student, or what you looked for and did not find',
        },
        ...(perCheckNotes ? {
          note: {
            type: 'string',
            description:
              'AT MOST TWO SHORT SENTENCES (about 30 words). The STUDENT reads this ' +
              'under the check, addressed to them as "you". Say what they did and, ' +
              'if it fell short, the one thing that would fix it. Not a restatement ' +
              'of the verdict. A note longer than two sentences is wrong here even ' +
              'if everything in it is true — there are several of these on one ' +
              'screen and they are read together. Spell out any abbreviation the ' +
              'rubric uses; the student has not read the rubric. Do NOT re-quote ' +
              'the student — their words are already displayed above this note, ' +
              'in `evidence`; say what to do about them instead.',
          },
        } : {}),
      },
      // Every key in `properties`, or the provider rejects the whole request:
      // strict structured output requires `required` to name all of them. A
      // count slot answers `count` INSTEAD of `verdict`, so the two lists have
      // to move together — listing `verdict` for a slot that does not offer it
      // fails the schema, not the answer.
      required: [
        ...(slot.countMax !== undefined ? ['count']
            : slot.picks !== undefined ? []          // its answer IS refers_to
            : ['verdict']),
        ...(coverOf.has(slot.key) ? ['refers_to'] : []),
        'evidence',
        ...(perCheckNotes ? ['note'] : []),
      ],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties: {
      checks: {
        type: 'object',
        properties,
        required: slots.filter(s => !computed.has(s.key)).map(s => s.key),
        additionalProperties: false,
      },
      feedback: {
        type: 'string',
        description: perCheckNotes
          // The detail now lives on each check, so a full essay here would say
          // everything twice. What is left is the part that belongs to the whole
          // answer rather than to any one check.
          ? 'One or two sentences opening the feedback: what the answer does well ' +
            'overall. Do NOT walk through the individual checks — each carries its ' +
            'own note, shown beside it. Spell out any abbreviation the rubric ' +
            'uses; the student has not read the rubric.'
          // No checklist is displayed, so this is the entire message rather
          // than an opening for one — and the only thing bounding its length.
          : 'The warm, specific feedback the student reads, and the ONLY thing ' +
            'they see: no checklist is shown. FOUR SENTENCES AT MOST — say the ' +
            'one or two things that would most improve the answer, not every ' +
            'check you completed. Consistent with the checks above. Spell out ' +
            'any abbreviation the rubric uses; the student has not read the rubric.',
      },
    },
    required: ['checks', 'feedback'],
    additionalProperties: false,
  };
}

/**
 * The guidance appended to a prompt when the student will see the checklist.
 *
 * The schema is what MAKES the model write a note per check; this says what the
 * notes are for, which the schema's field descriptions cannot convey as a whole:
 * that the reader sees each note directly beneath its own check, so the notes
 * must stand alone and must not repeat each other or the opening.
 *
 * Empty when the checklist is hidden. There, the student reads one paragraph and
 * splitting it across checks they never see would produce feedback assembled
 * from fragments about an invisible structure.
 */
export function slotSheetGuidance(showChecks: boolean): string {
  return studentFacingGuidance()
    + (showChecks ? checklistGuidance(true) : terseFeedbackGuidance());
}

/**
 * Length discipline for the case where prose is ALL the student gets.
 *
 * A hidden checklist removes the structure that was doing the compressing. With
 * checks shown, each comment is pinned to one check and capped at two sentences;
 * with them hidden, the model has one open-ended field, the whole sheet's worth
 * of findings in front of it, and nothing telling it to stop — so it writes an
 * essay. That is the opposite of the intent: these items are hidden because they
 * are graded generously and a tick list would read as a scorecard, and burying
 * that in six paragraphs is its own kind of discouraging.
 *
 * The cap has to be stated where the schema cannot state it. A `note` is short
 * because it belongs to one check; `feedback` here belongs to everything, so
 * only an explicit budget bounds it.
 */
function terseFeedbackGuidance(): string {
  return [
    '',
    'HOW LONG THE FEEDBACK SHOULD BE',
    '',
    'The student sees your `feedback` and NOTHING else — no checklist, no marks.',
    'That makes it the whole message, not a summary of one, and it must stay',
    'short enough to be read:',
    '',
    '- FOUR SENTENCES AT MOST, and fewer when fewer will do. This is a hard',
    '  limit, not a target to fill.',
    '- Say the one or two things that would most improve the answer. Not every',
    '  check you completed — you filled the whole sheet so the grading is sound,',
    '  but the student does not need a tour of it.',
    '- No preamble, no summary of what they wrote back to them, no closing',
    '  encouragement paragraph. Open with the substance.',
    '- If the answer is strong, say so in one sentence and stop. Padding a good',
    '  answer with invented suggestions is worse than being brief.',
  ].join('\n');
}

/**
 * Rules for the text the STUDENT reads, whether or not the checks are shown.
 *
 * A rubric is written for whoever grades it, and grading vocabulary is dense
 * with shorthand — the item's own key names, the abbreviations the course uses
 * for the things being judged. All of it is in this prompt, so all of it is
 * within reach of the prose, and a model writing to a student will reach for the
 * word the surrounding text uses.
 *
 * The student did not read the rubric. Feedback that says "your UTB is clear"
 * is feedback they have to decode before they can act on it, and the ones most
 * likely to be stuck are the least likely to decode it. Kept general rather than
 * listing the abbreviations: this module is shared by every course that authors
 * a sheet, and the ones that matter are whichever appear in the rubric above.
 */
function studentFacingGuidance(): string {
  return [
    '',
    'WRITING TO THE STUDENT',
    '',
    'Everything the student reads — `feedback`, and every `note` — is written for',
    'someone who has NOT seen the rubric, the checklist, or the marking scheme:',
    '',
    '- SPELL OUT every abbreviation and piece of shorthand the rubric uses.',
    '  Write "unwanted target behavior", never "UTB"; write the words the',
    '  abbreviation stands for, not the letters. This holds on every mention, not',
    '  just the first: the student has nowhere to look them up.',
    '- The same goes for check keys and internal labels. Name the thing in plain',
    '  words instead of quoting the key.',
    '- "You" in the prose you write means THE STUDENT, always. Where the rubric or',
    '  a check says "you" meaning YOU-THE-GRADER, switch to the first person: "a',
    '  judgement I was unsure about", not "a judgement you were unsure about".',
    '  Carrying that "you" across tells the student they did something they did',
    '  not do — they made no judgements; you did.',
    '- Use the words the QUESTION used where you can. That is the vocabulary the',
    '  student has actually been given.',
    '- NEVER refer to something the student cannot see. "That sentence", "this',
    '  part", "the second one", a bare "it" — none of them name anything findable,',
    '  and the student cannot act on a comment about a sentence they cannot',
    '  identify. Their words are already on screen: each check\'s `evidence` is',
    '  displayed directly above its note. Write the note so it reads as the next',
    '  thing said AFTER that quote — "this does not say why" is fine when the',
    '  quote is right above it; "that sentence does not say why" is not, because',
    '  it sounds like a different sentence somewhere else.',
  ].join('\n');
}

export function checklistGuidance(showChecks: boolean): string {
  if (!showChecks) return '';
  return [
    '',
    'HOW THIS FEEDBACK IS DISPLAYED',
    '',
    'The student sees your checks as a list, and each check\'s `note` appears',
    'directly underneath that check. So:',
    '',
    '- Put the comment about a check in that check\'s `note`, not in `feedback`.',
    '- KEEP EVERY NOTE TO AT MOST TWO SHORT SENTENCES. There are several on one',
    '  screen and they are read together: a paragraph under each tick is a wall of',
    '  text, and the student stops reading. If a note will not fit in two',
    '  sentences, say the single most useful thing and stop.',
    '- Each note stands on its own — the student reads it next to its own check,',
    '  not as part of a paragraph. Do not open a note by naming the check.',
    '- Do not repeat a point across notes, and do not summarise them in',
    '  `feedback`; `feedback` is one or two sentences about the answer as a whole.',
    '- Write every note, including for checks that passed: a tick with nothing',
    '  under it tells the student what, but never why. A passing note can be very',
    '  short — one sentence naming what worked is enough.',
  ].join('\n');
}

/**
 * Compose what the student sees: the prose, then the checklist itself.
 *
 * Showing the slots is the auditable half — which parts were found is visible
 * rather than inferred from a paragraph. A satisfied slot is ticked; anything
 * else gets a neutral dot rather than a cross, because a slot can be purely
 * informational (one reporting WHICH of four categories an answer falls into is
 * not a pass or a fail) and marking those as failures would misreport them.
 *
 * A slot the model somehow left out renders as "not reported" — never as
 * satisfied. Strict schemas make that unreachable, but the fallback path runs
 * on providers that ignore the schema.
 */
export function composeSlotFeedback(
  slots: SlotSpec[],
  data: Record<string, unknown>,
  opts: {
    showChecks?: boolean;
    cover?: CoverGroup[];
    equals?: EqualsRule[];
    onlyif?: OnlyIfRule[];
    counts?: CountGroup[];
    expect?: ExpectRule[];
    requires?: RequiresRule[];
    forbid?: ForbidRule[];
    maps?: MapsRule[];
  } = {},
): string {
  let checks = (data?.checks ?? {}) as Record<
    string,
    CheckPayload | undefined
  >;

  // Counted members are DERIVED from the count and deliberately left out of the
  // response schema, so the model never answers them. scoreSlotSheet resolves
  // them through satisfiedMap before scoring; this path did not, so a member
  // rendered as "not reported" while the score credited it — the student read
  // three reasons as missing on an item that had just awarded all three.
  // Resolve first, so display and score describe the same sheet.
  const counts = opts.counts ?? [];
  if (counts.length) checks = { ...checks, ...countedVerdicts(counts, checks) };
  const prose = typeof data?.feedback === 'string' ? data.feedback.trim() : '';

  const parts: string[] = [];
  if (prose) parts.push(prose);

  // Some items are graded deliberately generously, and a ✓/· list next to
  // feedback that is meant to encourage reads as a scorecard. Those authors set
  // showChecks="false": the model still has to fill the sheet — that is what
  // stops it skipping checks — but the student sees only the prose.
  if (opts.showChecks === false) return parts.join('\n\n');

  // A failed gate subsumes the rest: reporting eight verdicts underneath "this
  // is a different behaviour from the one you chose" invites the student to fix
  // the small things and miss the one that matters.
  const cover = opts.cover ?? [];
  const equals = opts.equals ?? [];
  const byKey = new Map(equals.map(r => [r.key, r]));
  const expect = opts.expect ?? [];
  const requires = opts.requires ?? [];
  const forbid = opts.forbid ?? [];
  const forbidByKey = new Map(forbid.map(r => [r.key, r]));
  const maps = opts.maps ?? [];
  const sat = satisfiedMap(slots, checks, cover, equals, counts, expect, requires, forbid, maps);
  const charged = chargedMap(slots, sat, opts.onlyif ?? []);
  const gate = failedGate(slots, checks, cover, equals, opts.onlyif ?? [], counts, expect,
                          requires, forbid, maps);
  const shown = gate ? [gate] : slots;

  const lines = shown.map(slot => {
    const rule = byKey.get(slot.key);
    // A forbid key has no verdict of its own — the model never answered it — so
    // show the operands it was computed from, which is what makes a zero on it
    // legible instead of arbitrary.
    const forbidRule = forbidByKey.get(slot.key);
    const verdict = rule
      ? computedVerdict(rule, checks)
      : forbidRule
      ? forbidRule.conds
          .map(c => `${c.slot}=${String(checks[c.slot]?.refers_to
                                         ?? checks[c.slot]?.verdict ?? '').trim() || '?'}`)
          .join(', ')
      : (checks[slot.key]?.verdict ?? '').trim();
    // A count is reported, not judged: it gets no tick, because there is no
    // sense in which "2 of 3" passed or failed on its own. What it feeds — the
    // member checks it expands into — carries the ticks.
    // Neither a count nor a classification is judged on its own: "2 of 3" and
    // "this is Negative Punishment" did not pass or fail. What judges them is
    // the rule that reads them — a counts group, an `equals`, an `expect` — and
    // that rule has its own line with its own tick.
    const isCount = slot.countMax !== undefined;
    const isPick = slot.picks !== undefined;
    const mark = (isCount || isPick) ? '–' : (sat[slot.key] ? '✓' : '·');
    // An unsatisfied check that was not charged would otherwise read as a lost
    // point the score does not show, so it says so.
    const moot = !sat[slot.key] && !charged[slot.key] ? ' (not counted separately)' : '';
    const shown = isCount
      ? (checks[slot.key]?.count ?? checks[slot.key]?.verdict ?? '')
      : isPick
        ? (checks[slot.key]?.refers_to ?? checks[slot.key]?.verdict ?? '')
        : displayVerdict(verdict);
    const line = `- ${mark} **${slot.label}** — ${String(shown) || 'not reported'}${moot}`;
    // What the verdict was decided ON, then what to do about it. Both belong to
    // this check, so both sit under it rather than in a paragraph the student
    // has to map back onto the ticks.
    //
    // `evidence` is shown rather than asked for again in prose: the model has
    // already located the exact span to decide the verdict, so a note that
    // quotes it repeats work the schema had done, and a note that says "that
    // sentence" instead points at something the student cannot see. Displaying
    // it makes the reference concrete by construction.
    //
    // Both are blank-tolerant: a counted member carries no evidence, a computed
    // check none of its own, and a sheet published before per-check notes has no
    // note — each still renders as a plain checklist line.
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
    const rawEvidence = flat(checks[slot.key]?.evidence ?? '');
    // A model with nothing to cite sometimes writes the word rather than an
    // empty string; shown to a student that is worse than showing nothing.
    const evidence = /^(none|n\/?a|null)\.?$/i.test(rawEvidence) ? '' : rawEvidence;
    const note = flat(checks[slot.key]?.note ?? '');
    return [line, evidence && `  *${evidence}*`, note && `  ${note}`]
      .filter(Boolean).join('\n\n');
  });

  if (lines.length) {
    parts.push(
      gate
        ? `**What I checked**\n\n${lines.join('\n')}\n\nStart here — the rest depends on it.`
        : `**What I checked**\n\n${lines.join('\n')}`,
    );
  }
  return parts.join('\n\n');
}
