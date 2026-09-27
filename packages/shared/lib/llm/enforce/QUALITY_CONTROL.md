# Building a first-version scoring model: a quality-control guide

Written after a full QC pass on a single item, which gained a cell
and ended with every remaining disagreement declared and explained. The point of
that pass was not the score. It was to get the FIXTURE
exactly right, build a scoring model that works for the right reasons, and
correct gold only where the submission itself contradicts it.

With 20 responses per item this produces a **first model, not a validated
one**. Everything below is about how to spend that small sample well.

---

<!-- qc:QC.0 -->
## 0. The order of operations

Work in this order. Most of the wasted effort in the session that produced this
guide came from doing step 3 while step 1 was still wrong.

0. **Exclusions.** Does every cell this item drops still deserve to be dropped?
1. **Fixture.** Does each box hold what the template says it holds?
2. **Gold.** Is the row right, and is its own itemisation coherent?
3. **Model.** Does the prompt tell the grader how to decide?
3a. **Leakage.** Does the prompt QUOTE the answers it is meant to judge?
4. **Declare** whatever is left.
5. **Reduce** the declarations, on the schedule in section 5.

**`leakage.py` runs before every sweep, and `agreement.py` REFUSES to sweep the
handout its gate is armed for while any rule block echoes the cohort without a
recorded verdict.**
A rule that borrows a student's sentence scores the cell it was copied from and
proves nothing about the criterion; worse, the sentence is almost always taken
from the very cell the rule was written to fix, so the gain it reports is
circular.

Re-measure such a gain with the borrowed sentence replaced by an invented one.
A rule that holds its number was a real criterion; a rule that loses a cell was
not. And the load-bearing cell can be the one a note DESCRIBED in PARAPHRASE
rather than the one reproduced word for word — the form neither the n-gram check
nor the bigram check can see, and the one that matters.

Neither was noticed by reading. Both are obvious the moment the prose and the
responses are diffed, which is all the tool does.

A PHRASE-LEVEL REWRITE IS NOT A FIX. The instrument now runs three checks — a
6-gram exact match, a shared-bigram check, and a SINGLE-WORD check — and the
third was added because the first two passed prose the second rewrite had left
half-borrowed. Swapping the student's noun out leaves the student's VERB in
place — and that verb is typically in the list the gate matches on, in the cell
the gate was built for. Change the object and the borrowed WORD survives, which
is the part the model keys on.

The single-word check flags a word that (a) appears in a few students' answers,
(b) is absent from the handout and the type definitions, and (c) appears nowhere
else in our own prose — that last clause being what separates a word the cohort
supplied from one the assignment did. It is noisier than the bigram check by
design, and most of what it flags is ordinary English or the instrument's own
examples. Triage is cheap and mechanical — phrase-check the block's example
sentences against the cohort, and a sentence that appears in no response
exonerates every word in it.

A shared phrase is not automatically a fault, and the tool cannot tell the three
cases apart — DOMAIN VOCABULARY that both sides must use, COINCIDENCE where an
invented example lands on a stock phrasing, and QUOTATION. A person judges, and
records the judgement with `--review`. **Verdicts are keyed to the sha of the
prose**, so re-wording a block lapses its waiver and the gate asks again — which
is the property that matters, because a rule gets re-worded at exactly the
moment someone is tempted to paste a student's sentence into it.

The worst form is not a quoted phrase but a described cell WITH ITS GRADE
attached — a sentence that recounts one participant's configuration and what it
earned. That tells the grader the answer for one identifiable row. State the
criterion, never the row.

A DELETION IS A CHANGE, AND NOTHING WAS WATCHING FOR IT. Every instrument here
polices what the prompts SAY. None watched what they stopped saying. A slot
added in the morning to win a cell and removed the same day as superseded takes
the cell with it, with every remaining check on its sheet passing: no verdict
wrong, no gate fired, and the loss appearing only as a median two cells down,
several sweeps later.

`check_selectors_govern_something` now catches it from both ends: a selector
tuple consulted nowhere, and a slot key the scorers still read that no sheet
emits. Both halves fire on that deletion.

Two things found while building it, each worse than the bug:

* **`python3 enforcement.py` does not run the audit.** It prints
  `cli_signatures()` and exits 0. The audit is `python3 equivalence.py
  --enforcement`. Exit 0 from the wrong command is reported as a clean gate
  more than once before anyone notices.
* **Six checks were never invoked at all** — defined, documented, maintained,
  wired to nothing. Among them `check_weighted_slots_are_scored`, written the
  same morning to catch a weighted slot the arithmetic ignored, silent through
  the very regression it was built for. All six pass; they are now wired, and
  `check_every_check_is_invoked` fails the audit if another is ever orphaned.
  The first attempt to find them reported none, because it searched for
  `check_x(` and every definition matches that on its own `def` line.

**`measured.py --preflight` enumerates what is outstanding, in this order, and
`agreement.py` REFUSES a probe while anything is.** A probe is a participant
subset run six or more times: ~24 calls to settle one cell, and a settled cell
is worth nothing while that item's fixture is unread or its gold row does not
reconcile with its own comment. `--force-probe` overrides it, for the case where
the probe IS what settles a blocker.

The gate is code rather than a paragraph because this section already told
someone to check exclusions first and seven items were worked before any
exclusion was retested. A step order that is only written down is a step order
that gets skipped under momentum, and probes are exactly where momentum
gathers — they feel like progress and cost a fraction of a sweep.

Two of its detectors are worth knowing about, since both were built from
mistakes made here:

- **Fixture suspects.** A cell wrong in every run where we award NOTHING against
  full-marks gold, or award something against gold 0. Every other stable miss is
  typically off by one deduction step, which is what a criterion boundary
  looks like; these two shapes are what a box holding the wrong text looks like.
  It consults EVERY artifact before flagging, because a cell that was ever right
  is unstable rather than mis-parsed, and reading its fixture will find nothing.
  That check removes candidates on its first run, including ones a session has
  already called a probable fixture defect out loud.
- **Non-reconciling gold rows.** Where a grader itemises their arithmetic, the
  itemisation can be checked against the score. It finds rows nobody has looked
  at, after the first few are found by hand.

Every step that edits prompt prose ends with a sweep of the items it touched,
compared against the last baseline on the same denominator, BEFORE the commit —
including steps 0 and 5, where the edit is a deleted citation rather than a new
rule. See "No prompt edit is finished until it has been measured" in section 2.

A scoring model tuned against a bad fixture measures the fixture. A model whose
declarations only ever grow measures the declarations.

**Step 0 is not a typo for step 5, and running one is not running the other.**
Section 5 sweeps the whole set of declarations when an item closes out; step 0
audits THIS item's exclusions before any work on it begins, which is also step
1 of EQUIVALENCE.md's cleanup procedure ("Remove exclusions the item gets wrong
anyway... Expect the reported number to FALL; that is the point"). The two are
easy to conflate and the cost of conflating them is one-directional: you spend
the session improving a rate computed over cells that were chosen to make it
look good.

It has happened on this guide, to someone who had read it: a run of items
worked and closed — criteria rewritten and measured, others declared — before
any exclusion was retested. The audit then takes minutes, because excluded cells
are still run and still scored, and it finds cells that were wrong in every run
with the answer and the grader's decision sitting in their prompt. Items
reported as perfect stop being perfect. Every number reported before such an
audit was computed over a denominator the audit shrinks.

**Both questions only apply to exclusions that are claims about the MODEL.**
`cell_exclusions` returns a kind with every cell, and the kind decides whether
measurement can say anything at all:

| kind | what it claims | can a sweep refute it? |
|---|---|---|
| `self_graded` | the prompt hands over the answer and the grader's decision | yes — that is the necessity test |
| `unscoreable` | gold's row cannot be reached by any correct answer | yes — a cell that reaches it refutes the claim |
| `suspect` | the submission was mis-transcribed; the input is another participant's data | **no, ever** |

A suspect cell is also **never evidence in a declaration's reasoning** — not for
gold and not against it. A `CORRECTED_GOLD` entry has been argued partly on the
grounds that an item's gold was incoherent, citing the very byte-identical pair
whose contradiction is *why* both are excluded.
`enforcement.check_no_declaration_cites_a_suspect_cell` now scans declaration
prose for such citations, allowing one only inside a sentence that names the cell
suspect.

A `suspect` cell agreeing with gold is a coincidence between the wrong
student's answer and this student's score, and it is the single reading that
must not be taken as reassurance. There is nothing to be right about: the input
is not what the student wrote. No number of passes can retire it — only
re-transcribing the submission can.

This was not hypothetical for long. The expired-declaration check went in and
within minutes offered to un-exclude a known mis-transcription, because it
scored full marks. The check now reads the kind and skips `suspect` entirely;
`unscoreable` and `self_graded` still fire, verified both ways.

**For the two kinds that ARE claims about the model, step 0 asks TWO questions,
and the second is the one that gets skipped: is this exclusion CORRECT, and is
it NECESSARY?** They have different answers and opposite consequences.

| | the cell scores WRONG | the cell scores RIGHT |
|---|---|---|
| **correct?** | the exclusion is hiding a miss — remove it, take the miss | the exclusion is consistent with itself |
| **necessary?** | — | UNTESTED until you remove the citation and measure |

An exclusion on a cell that scores right is not thereby justified. It rests on
a claim — that the prompt hands the grader this answer — and that claim is
testable: rewrite the citation as the RULE it was illustrating, measure the
cell again, and see whether it still scores right without the answer in front
of it. If it does, the citation was never load-bearing, and BOTH the citation
and the exclusion go: the cell counts, and the denominator grows.

This is the direction the reduction pressure usually misses, because nothing
about a correct cell looks wrong. Section 5's two rules both start from a
problem — a miss being hidden, a stale claim reporting unwinnable ground — so
an exclusion whose cell behaves can sit undisturbed forever while quietly
costing the rate a cell it has earned. The audit that found the eight wrong
ones also left 21 right ones untouched with the words "the exclusion is doing
its job", which was an assumption dressed as a verdict: what its job REQUIRES
is that the citation be doing work, and none of the 21 had been asked.

Both halves are cheap and neither is optional. The wrong ones cost you a rate
you did not earn; the unnecessary ones cost you cells you did.

**Un-excluding a cell turns every existing quote of that student into a live
answer key, so sweep ALL items and ALL prompt sources afterwards — and keep
sweeping until the check is clean.** An exclusion licenses the prompts to quote
that participant freely. Remove it and every one of those quotes becomes what
`check_rule_examples_are_not_corpus` exists to catch: the model reading a
counted cell's own words with the verdict attached. The quotes are not where
you left them, either. They accumulate in two places — a rubric `desc` or a
`guidance` bullet, and `olx_prompts.SLOT_NOTES`, which is a second source of
prompt prose that a scan of the rubric alone will not see.

Measured the hard way. Un-excluding two cells lit up quotes that had sat there
legally for months. Fixing the rubric copy surfaced a second copy in
SLOT_NOTES; fixing that surfaced a THIRD copy of the same student's sentence in
a different note. Three passes of the same check to reach clean, on one
exclusion change. So: run the check as the last step of every exclusion
change, not the first, and run it again after each fix.

**Measure it, and know which direction the answer went.** A citation is usually
a bare attribution with a decision attached — a participant number, and what
they scored — and deleting it leaves every rule intact. That is the
common shape, and the reason the test is usually cheap. Run the item three times
with the citations gone and compare three populations: the cells already
counted, the cited cells, and the whole item.

Where the citations turn out to be load-bearing for nothing, the honest rate is
the whole item's, and it can be HIGHER than the rate that was being reported.
Cells we score correctly had been subtracted from every rate on an untested
claim. An audit that only looks for exclusions hiding misses would never have
found them, because there was no miss to find.

**Why this half gets skipped, stated plainly so the next reader recognises
it.** A wrong-and-excluded cell eventually attracts attention: the item reads
as perfect and someone asks why. A right-and-excluded cell produces no symptom
at all — the rate is merely smaller than it should be, and a smaller
denominator looks like rigour. Of 34 exclusions audited in one pass, the 8
hiding misses were found and fixed the same hour; the 21 that were merely
unnecessary were dismissed in a sentence, and finding them took a second pass
and a second prompt.

**Every step ends by writing down what it found and did not fix, in
`scoring/BACKLOG.md`.** Nothing in that file is enforced, which is exactly why
the entry has to be written: a finding that lives only in a session log is
gone, and several of a fixture audit's findings are visible nowhere else — the
readout that produced them costs an hour to reproduce. The declarations in
`enforcement.py` record what the audit SETTLED; the backlog records what it
opened.

---

<!-- qc:QC.what-is-computed -->
### What is COMPUTED is likelier to be right than what is WRITTEN

**The reliable/unreliable line does not fall between the scorer and the
reporter. It falls between what a program computes and what a language model
writes.** Everything on the computed side -- the arithmetic, the ledger, the
per-check tables, the enforcement checks -- has been right nearly every time it
was doubted. Everything written in prose has been the weak half, and that includes
BOTH halves of the work: the scoring model's judgements are wrong at a few percent
per slot, and the summaries, inferences and subgoal entries written about them
have been wrong more often than that.

The scoring model looks reliable in the record only because a program constrains
it: a slot sheet, a fixed vocabulary, arithmetic it cannot influence. Where prose
is unconstrained -- an entry's headline, a precision figure quoted from memory, a
claim about which cells a subgoal owns -- it drifts, and the drift is invisible
because prose does not disagree with itself the way two numbers do. Over the
longest campaign here, one item finished at 100 / 99.4 / 100% per check while the
entries describing it accumulated a stale precision table, a suspect cell listed
as evidence, two cells resolved by corrections nobody propagated, and a headline
the data contradicted.

**So: put the load on the computed side wherever the choice exists.** A number a
check derives beats the same number typed into a sentence; a table regenerated on
every recording beats one pasted once. When something must be written down, write
it so a check can contradict it later -- name cells, name counts, name the
artifact -- because a claim that cannot be contradicted cannot be maintained
either. That is why the fixes that earn their keep here make honest figures
**unavoidable** rather than available: the spread printed on every `--record`, the
fixture preflight in both harnesses, the prose-number ratchet that reads GOALS.md
against the ledger.

<!-- qc:QC.1 -->
## 1. Fixture first

**Read the boxes out one at a time against the document.** This finds defects
no check catches. Four found this way in one item: two boxes cut
mid-construction, one clause occupying two boxes, one box holding a purpose
clause that belonged to its neighbour. Each had previously been explained as a
fault in gold or in the model.

**READ EVERY RESPONSE IN FULL. A truncated readout is not a readout.** Print the
whole box and the whole document region it came from — every line, to the end —
whenever a response is being read for any purpose: a fixture audit, a
disagreement with gold, a decision about a declaration, or a claim in a report.
Never sample a response with a line-limited command, never quote from the first
sentence, and never let a table of one-line excerpts stand in for the text. The
`--fixture ITEM:PID` readout prints every line for exactly this reason.

The failure is not hypothetical and it is not cheap. A survey built with
`sed -n '7p'` — the first response line of each cell — returns a truncated
answer, and on that basis a cell can be reported as one gold credits while
satisfying none of the criterion's parts at all. That single
"fact" is then enough to argue that gold on the item is not reproducible by any
rule, that no gate could ever match it, and that a declared divergence is
therefore correct — an argument written up and stated to the user.

Read in full, the truncated cell has a second sentence that makes it a textbook
instance, the item's gold-bearing cells separate PERFECTLY on a single feature,
and the rule that had just been declared unreachable is sitting in plain view.

So: the cost of a truncated readout is not a missed detail, it is a confident
conclusion in the wrong direction, defended with evidence that does not exist.
If a response is worth reading, it is worth reading to the end.

**An item answered with a chart or a table is read by PROVENANCE, not by
position.** The on-screen boxes are a RECONSTRUCTION: the paper assignment asks
one complex question, the lo-blocks version presents it as one or more
subquestions, and the fixture has to deal that single original response out
among them. Where the response is prose, a box can be located in the text and
the question is whether it was cut in the right place. Where the answer is a
chart or a table there is no prose to cut, so whatever fills a box got there by
somebody's judgement, and the question changes to "is this the student's value,
or is it somebody's account of their value".

A label box is the common trap: it can hold the PAPER SCORER's sentence
describing the label rather than the student's own — which is the answer to the
grader's own question sitting in the field it reads. Ask of every parsed or
extracted box: could this text only have come from the student?

**Suspect the fixture before gold or the model.** Three cells once written up
as "a criterion gold decides inconsistently" or "a borderline flip" were our
own splits. "Gold is wrong" is the more flattering hypothesis; check the
cheaper one first.

**Know which overlaps are devices and which are defects.** A naming box and an
effect box cut from one clause may legitimately hold the same text: the
duplication is what lets each be judged. Removing it can make the fixture more
faithful and less scoreable — measured, one such split took an effect box from
`met` 9/9 to `incomplete` 7/9, because the box had been earning its credit on
the phrase it shared with its neighbour. What the exemption HIDES is the pair
being cut in the wrong place, which is the real defect.

**If a sentence splits across boxes at a conjunction inside the scope of a
negation, repeat the negation on the later conjunct.** "No longer X and Y"
split naively leaves "Y" asserting the opposite of what the student wrote. Two
non-verbatim words in the corpus so far, both one negation carried across one
split. Note that repeating it does not guarantee the box still scores: if the
phrase that ties to the reference text lives in only one conjunct, the other
conjunct may be too thin to be judged.

**An empty box renders as nothing, and the LAST box is exposed.** A `<Ref>` to
an empty field produces blank space; for the final box there is no following
heading, so whatever the app appends lands where its contents belong. That
produced a grader quoting a section heading of the prompt back to the student
as their own sentence, six times across five cells, invisible in every score
because the two verdicts involved score the same. Delimit every box and
terminate the response section.

**Close the audit with a backlog entry, and put five things in it.** The
repairs are in the fixture and the confirmations are in `MULTI_BLOCK_DECLARED`;
what needs the entry is (1) the cells whose miss the readout has now EXCLUDED
the fixture from explaining, with the passes behind them, (2) any exclusion the
readout retested and found stale, (3) the re-baseline the repairs themselves
require, since every stored number for a repaired cell now describes a fixture
that is no longer served, (4) published claims about the item the readout
contradicts, and (5) the shape the remaining error has, if it has one. The last
is the one worth the most and the one a per-cell fix list loses: an audit may
repair a handful of boxes and still find that every miss left in the item has
the SAME SHAPE — all over-credit, all in one direction — which is a single
target rather than a scatter of unrelated cells.

**Seed the fallbacks the OLX declares.** A `<SheetValue>` resolves from a
graded sheet and falls back to a plain component; a harness that grades one
item sees neither. Left unseeded it renders a labelled context line with
nothing after it — a harness artifact that looks exactly like a prompt defect.

---

<!-- qc:QC.a-rubric-edit-can -->
### A RUBRIC EDIT CAN CHANGE THE INPUT, NOT ONLY THE SCORING

**Where on-screen boxes are a RECONSTRUCTION, the rubric drives it.** When the
answer is one prose block, `score.py`'s counted-group distribution pulls the
quoted spans out of the count slot's evidence and deals them to the members,
writing the placeholder `f"{n} found"` where there are fewer spans than the count.
So the fixture depends on the item declaring `counts`.

A structural attempt that removes that group stops the distribution. The
placeholders are never overwritten, cells' boxes become the literal string
`"N found"`, and a sweep then measures the item well below its baseline so the
change reads as refuted — **when it had never been tested.**

Two things follow, and both are now enforced rather than remembered:

* `enforcement.check_fixture_boxes_hold_the_students_words` requires every
  scorer-sourced box to appear in the participant's transcribed answer. A real
  span is quoted OUT of the response and always does; a placeholder never does.
* `agreement_app.check_fixture_is_not_corrupt` runs it as a **preflight in both
  sweep harnesses**, so a corrupt fixture costs nothing instead of 120 calls.

Note what did NOT catch it. `check_fixture_covers_the_response` looks for an EMPTY
box beside a long unassigned run, and a box holding a placeholder is not empty.
`agreement_app.context_value` guards this very string — its comment names
`"2 found"` — but only on the read-only CONTEXT path, and its guard asks
`counted_members`, so removing the count group disabled the guard and caused the
corruption in one stroke. **The dealing groups now live in the FIXTURE layer, as
`dealt` in `agreement_app.JOBS`, so a scoring change cannot reach the input.**

<!-- qc:QC.2 -->
## 2. Measurement discipline

**MODEL NOTHING YOU CAN EXERCISE. A scorer is checked by RUNNING it on
synthetic sheets and watching the number, never by reading its sheet.** This is
now `check_web_scorer_exercises_its_sheet`, in the audit and in the pre-sweep
gate, and it costs no calls.

The enforcement audit had a blind spot no injected breakage could reach, and its
own declaration named it: "the olx probe sees that pair because it reads slot
keys". Modelling one side from the SHEET means a scorer that parses a primitive
correctly and then ignores it is indistinguishable from one that honours it.
Every selftest case removes something from the sheet, which the probe reads; none
can remove something from the SCORER.

That is how `onlyif` was dead on the olx path while the audit reported the
behaviour present. `score_slots` built its charge-once map from
`spec.get("onlyif")`, and `spec` there is `merged`, which never carried it, so the
map was all-True and the guard never fired. Shown with a before column:

    BEFORE (HEAD)   cond-fails charges 2, cond-holds charges 1   RULE IGNORED
    AFTER           cond-fails charges 1, cond-holds charges 1   HONOURED

The probes are cheap because they are synthetic: 179 of them, no model calls,
covering 76 rule instances across both scorer paths -- `equals` (6), `expect`
(5), `forbid` (4), `counts` (5), `cover` (2), `derived` (1), `onlyif` (1) and 57
gating slots, five of those gates computed rather than answered. The rule is one
sentence: **an assertion primitive, violated, must move the number; a
suppression primitive, violated, must not move it further.** A flat result means
the rule reaches no arithmetic.

Cover every primitive, not only the one that broke. When this check was written
for `onlyif` and `counts` it probed 2 `equals` instances of 6 and had ZERO
coverage of `expect` and `forbid`, because both live on the `score_oc` path and
the check only ran `score_slots`. Neither had ever been exercised by anything.

Three things a naive probe gets wrong, each of which reports clean while
measuring nothing:

1. **Build the spec the RUNNER builds.** `measure_one` hands the scorer
   `dict(job, slots=..., cover=..., requires=...)` -- a spec carrying no
   `equals`, `counts`, `onlyif` or `choices`. Probing with the full action dict
   makes `spec.get("onlyif")` work in the probe and stay dead in production, so
   the check would have missed the very bug it was written for.
2. **Do not answer the computed keys.** `equals`, `derived`, `expect` and
   `forbid` are stripped from the response schema and filled by
   `apply_computed`. A sheet that pre-answers them makes the rule unobservable.
   Pre-filling a type-match key produces a confident report of a dead
   `equals`, and a "fix" to a scorer that was correct throughout -- the
   gate zeroes the item, as `before_after.py` then showed by refusing to call an
   identical result evidence.
3. **Make the control earn full marks.** `score_oc` gates on four definitional
   criteria and returns at the first failure, so a control that already fails one
   makes every rule below it invisible. A first-value-everywhere sheet is not a
   passing sheet: a counter carries `count_max` and no options, so a verdict in
   that field parses to n=0 and marks every member absent, and a `cover` slot is
   credited on a `refers_to` label, so a verdict-only answer claims nothing. Both
   read as "this item cannot reach full marks" -- six items so reported -- when
   the control was built to the wrong shape. Hill-climb to the maximum, and
   report an item where that cannot be reached rather than probing past it.

And count the probes. Zero probes reads exactly like zero faults: two pick slots
with empty `options` once made this check run no probes at all on two items while
reporting clean. The count and the per-primitive tally are asserted, not assumed.

**THE SELFTEST INJECTS INTO THE SCORER TOO.** Thirty-nine cases removed
something from a sheet, and the audit reads sheets, so all thirty-nine were
reachable by construction -- that is why the class they cannot reach survived.
Eight further cases break the ARITHMETIC and leave every sheet intact: a computed
primitive that always answers "satisfied" (one per primitive), the counted
expansion dropped, coverage dropped from `satisfiedMap`, a gate demoted to an
ordinary slot, and `onlyif` ignored. Only a check that RUNS the scorer can see
them, so each is a test of the behavioural check itself.

**A HARNESS FIX MUST BE TESTED AGAINST THE PRE-FIX CODE. `python3
before_after.py '<snippet>'` runs it in both trees and refuses to call an
identical result evidence.** Testing a fix against only the fixed code answers
"can this code do X", never "did my change make it do X", and those differ
exactly when the change does nothing.

It happened, and it cost 140 calls. `counts=` looked unparsed in the harness, so
five items appeared to have two-to-six points that could never be charged. The
verification was a synthetic `count=1` fed to `score_slots`, which returned 4.0
out of 6 -- read as "the fix works", but the same input returned 4.0 at HEAD too:
the rubric items carry their own `counts` key and `score_slots` reads it from
THERE, so the machinery had never been broken. Two sweeps were launched, a
confident wrong diagnosis was stated twice, and the numbers came back unchanged
because nothing had changed.

Three free checks would each have caught it alone, and the order matters:

1. **Read the consumer's signature, not just its body.** `for cr in
   item.get("counts", [])` sits in `score_slots(spec, item, checks)` where
   `item` is the RUBRIC item. Parsing an OLX attribute into the action dict
   could not feed that loop, and the parameter list says so.
2. **Ask whether the other side already implements it.** `score.py` had honoured
   `onlyif` from the rubric all along. When the python implements a primitive and
   `equivalence.py --enforcement` reports no divergence, the olx side cannot be
   missing it -- that is what a two-sided audit is for, and it is free.
3. **Run the before.** One command, now.

`agreement.py` runs the structural checks at the top of every sweep for the same
reason (`cheap_checks_gate`, `--force-checks` to override). The checks read
source and gold and make no model calls, so the question is never whether they
are worth running.

This is where the leverage is. Nearly every wrong conclusion in the session
came from comparing two numbers computed on different bases.

**Match the measurement to the SCOPE of the claim, in both directions.**

| claim | needs |
|---|---|
| "the item is at N/20" | 3 passes |
| "cell X is wrong" | ~9 passes |
| "cell X improved from 11% to 44%" | ~30 passes per arm |
| "this rule helps overall" | a 9-pass CORPUS sweep |

Both errors are easy. A 3-pass table cannot distinguish a 56% coin flip from a
stable 11% miss — both print as one `-1.25`. And a 4-cell probe cannot see an
effect distributed thinly across twenty cells: one rule measured as worth ~1.8
cells corpus-wide showed nothing on any single cell.

**Establish base rates before attributing anything.** Four rule variants were
each credited with "fixing" a cell that turned out to be 56% exact unaided.

**When a 3-run measurement moves ONE cell, probe that cell before believing it
in either direction — and put stable cells in the probe with it.** The scope
table says a per-cell claim needs about nine passes; this is what that means in
practice, because the situation arises constantly and neither instinct is safe.
Accepting the move invents a defect; dismissing it as noise hides a real
regression. A probe is a handful of calls against the sixty an item costs, so
the answer is always to measure rather than to decide.

The controls are what make it worth running. One or two cells that were stable
and are not the target separate a SPECIFIC regression from item-wide wobble: if
the target moves and the controls hold, the change did it; if everything
wobbles, the item's variance did, and the target was never the story.

Both errors have happened here on the same day. A baseline had a cell wrong in
3 of 3 and a criterion rewrite was drafted for it; six passes said 4 of 6, the
rubric had already recorded that cell as a model limit, and the "fix" would have
re-litigated a settled question against an unlucky draw. In the other direction,
an item's numerator fell by one in one run of three after citations were
removed, on a single cell — small enough to wave through, except that the item's
baseline spread was 0 cells, which makes a stable-right cell going 2 of 3 a
change in the item's STABILITY rather than in its score.

Knowing the rule is not complying with it, and the way it fails is through the
output format of whatever script did the comparison. A scratch
comparison once printed `<-- LOST` for a cell that went 3/3 to 2/3 and
`<-- gained` for one that went 1/3 to 3/3, and both were written up
immediately — one as "a wobble inside the item's variance band", the other as
"the rewrite fixed it" — with no probe run and this paragraph already in the
guide. Two labels in a report were enough to skip it, because a line that reads
like a verdict gets used as one.

So the arithmetic moved into `compare_runs.py`, which prints PROBE REQUIRED and
the exact command instead of a direction, marks the comparison NOT REPORTABLE,
and exits non-zero so a chained script stops rather than continuing. Use it
rather than writing the tally inline — that is also how the two definitions of
`scored_exactly` came to disagree in print.

**A clean 3/3-to-0/3 flip is not decisive either, and that exemption is the
dangerous one.** `compare_runs.py` shipped with one: a cell uniform before and
uniform after was reported as REGRESSED or FIXED without a probe, on the
reasoning that three-and-three is more than a rate. One cell retired it within
the hour: across six sweeps it scores 10 of 18, having produced 0/3, 2/3 and 3/3
in both directions — three consecutive identical runs each way. A
coin throws uniform triples about a quarter of the time, so uniformity is
precisely what three passes cannot separate from a real flip, and the exemption
sat exactly where acting on noise is most tempting, because a clean flip is what
looks worth chasing. Had that REGRESSED line been believed, the next hours would
have gone to hunting a regression in a prompt that never caused one.

**Quote the ledger's number, not the run table's best line.** `--record`
publishes the median run; reading a three-run table by eye invites the best one,
especially when it agrees with the change just made. An item was reported a cell
high off a sweep whose runs were 17, 17, 18 — the median was 17, and 18 was the
flattering pick. A same-prompt repeat then produced 18, 18, 19, so the figure
happened to survive; the reasoning did not, and it is the same optimistic-read
reflex that put a decisive-move exemption in `compare_runs.py`.

Corollary worth its own line: **check a suspicious cell against every artifact
that ever measured it, not just the previous sweep.** A cell's six-sweep history
takes one query and settles in seconds what a fresh probe would have spent 24
calls on — and it answers a question a probe cannot, which is whether the cell
was ever stable in the first place.

**Land a declaration correction and a denominator change as SEPARATE steps.**
Both are cheap and both are tempting to do in one commit, and then the next
measurement mixes them: a rate that moved because two entries were rewritten is
indistinguishable from a rate that moved because six cells started counting.
Correct the declarations first — they are text, and their numbers are already
in hand — then change the denominator, then measure. This is the bundling rule
from section 6 applied to declarations rather than to rules, and declarations
are where it is easiest to forget, because neither half feels like an
experiment.

**Pre-register the prediction and name a CONTROL cell.** A control is a cell
whose answer the change must NOT alter. Controls caught what totals hid, twice:
a rule that looked clean on its targets had broken a cell no error list named.

**Compare against the RECORDED state, not only the old baseline.** A diff
against a stale baseline cannot see a gain being undone: a cell can be 0 of 3 in
the baseline, fixed to 5 of 6 by a committed change, and knocked back to 0 of 3
by a later edit that never mentioned the gate it moved — and the comparison
reads "no change", because both ends were 0 of 3. `compare_runs.py`
now diffs against the ledger's recorded run as well, and prints REGRESSION
AGAINST THE RECORDED STATE for any cell an earlier change had already won.

The companion habit: **when an edit measures neutral, ask whether it is neutral
or COMPENSATING.** That same sweep held its median at 15 while one cell gained
two runs and another lost three. Only the per-cell table shows it, and a median
is exactly the statistic that hides it.

**Ask the grader for a PARSE, not a judgement.** This is the difference between
a rule that works and the same rule that wobbles, and it cost eight attempts on
one cell to find.

A question about the PLAN invites the model to weigh the whole answer: "is the
required element delivered?", "does this target the right thing?", "is this
really an instance of the concept?". On easy cells it agrees with you; on the
cells that matter it returns different verdicts run to run, because the question
has no procedure in it. A question about the SENTENCE has one: "find the clause
that states the element; is a person in its subject position, and does its verb
say that person brings the thing about or takes it away?" That is a parse, and
parses do not wobble.

Measured. Four semantic framings failed, including a well-formed binary gate
that still flipped the two decisive cells — the target read delivered two times
in three, and a correct neighbour read undelivered one time in three. The same
criterion asked syntactically put both at 6 of 6, correct, controls holding, and
the item gained two cells. Nothing about the criterion changed; only what the
model was asked to look at.

Two corollaries worth the words:

- **A closed list in a rule is a boundary you are promising to defend.** The
  first syntactic version listed transfer verbs — give, buy, treat, withhold —
  and so excluded a student granting themselves a privilege, putting a correct
  cell at 3 of 6. The case had been
  noticed on paper, marked "marginal", and waved through. Widening from "is the
  verb on this list" to "does a person make the thing happen or stop happening"
  fixed it at 6 of 6. Prefer the criterion the list was approximating.
- **Give a gate no hedge.** `!key:Label:unclear` ADDS `unclear` to `met`/`absent`,
  and a gate fails on anything but satisfied — so the hedge becomes a 4-point
  coin flip on every cell. Omit the segment for a binary gate. Removing the hedge
  is necessary and not sufficient: it was the reframing that fixed the judgement.

**Sweep, don't probe, for rules keyed on relations between boxes.** Such a rule
can fire on any cell exhibiting the relation, so the affected set cannot be
predicted from where the errors are.

**A stored result does not recompute when gold changes.** Correcting a row
invalidates every earlier measurement of that cell. Re-derive baselines from
`.runs.json` after touching the gold caveats, or compare only figures computed
on the same gold. A published figure was cited for a whole day; on current
gold the same run scored a point lower, and the difference got blamed on the
reporter.

**Re-derivation is valid for a change to what a run is COMPARED AGAINST, and
invalid for a change to what the grader was SENT.** The distinction is the
whole of it: a corrected gold row, a new exclusion, a different definition of
exact — none of those change what the model saw, so the stored verdicts still
stand and recomputing them is honest. A prompt or fixture edit changes the
input, and every stored verdict was produced by a grader that never read it.
Re-deriving there is not a cheap measurement; it is an assumption that the edit
did nothing, dressed up as a result.

**When the denominator moves and the prompt moved with it, compare
NUMERATORS.** Removing exclusions raises the denominator, and a rate can hold
steady while the count of cells you actually get right falls — the arithmetic
hides the loss exactly where you are least likely to look for it. State the
threshold as a count, before measuring: "the numerator must not fall below 12."

Worked. Eight `self_graded` exclusions were removed and the citations that
justified them came out of the prompts, which meant deleting worked examples
from three items. Re-deriving from the pre-change runs left their numerators
unchanged BY CONSTRUCTION, since the newly
counted cells were the ones already known to be wrong. That number could not
answer the only question that mattered: whether the deleted examples had been
doing work for the OTHER cells. Only a fresh sweep of the three items can say,
and the answer is a numerator, not a rate.

**Never regenerate the prompt while a run is in flight, and do not trust
yourself to remember.** Both harnesses read the generated `.olx` per call, so a
`--write` part-way through splits that run across two prompts: the cells
already sent used the old text, the rest use the new, and the `.runs.json`
records nothing about it. It reads exactly like a clean measurement, and it is
the one contamination that cannot be detected afterwards — the before and the
after differ by an unknown mixture.

Done once by someone who had deliberately waited for two earlier runs
to clear for precisely this reason. An item's baseline came out as 40 cells of
old prompt and 20 of new, and the two items queued behind it would have measured
the NEW prompt as their baseline. All three discarded.

`olx_prompts.py --write` now REFUSES while a harness process is scoring cells,
naming the process, with `--force` for the case where the run is knowingly
being thrown away. The check is at the point of the mistake rather than in the
audit, because an audit that runs afterwards can only tell you the measurement
was worthless.

**No prompt edit is finished until it has been measured, and a commit is not
the place to find that out.** Every change to prompt prose — a rubric rule, a
`SLOT_NOTES` entry, an invented example replacing a quote — needs its item swept
before it lands, compared against the last baseline on the same denominator. An
edit that merely satisfies an enforcement check is the most dangerous kind,
because the check going green feels like the work finishing. It isn't: the check
proves the prompt no longer leaks an answer, and says nothing whatever about
whether the replacement still teaches the rule.

This bites hardest on exactly the edits that look safest. Swapping a real quote
for an invented one of the same shape is a rewrite of the only concrete example
the grader has for that slot, and concrete examples are what these prompts run
on — an item can lose six cells to a rewrite that replaces examples with
abstractions, and get them back only when invented examples go in. Cleaning
leaked quotes out of a slot is the same operation, and it lands hardest where a
code comment already records those slots as variance-sensitive.

So: sweep, compare numerators, THEN commit. If the numbers drop, the leak still
has to go — but it goes together with a rewrite that holds, or with the loss
declared, and either way the commit says what the change cost.

`olx_prompts.py --write` now names the sections whose text it changed and calls
them UNMEASURED, because the thing that actually goes wrong is not disagreeing
with this rule, it is sweeping from memory: editing four `SLOT_NOTES` entries,
remembering three, and publishing a baseline for an item whose prose moved
underneath it. The generator knows exactly which sections it rewrote, so it says
so, at the point of the mistake rather than in an audit afterwards.

**End every sweep by recording it: `measured.py --record <item> OUT/<item>.runs.json`.**
This is the step that makes the two rules above enforceable rather than
aspirational. The ledger stores the SHA of the item's own OLX section and the
exact exclusion set the number was computed over, and
`check_items_are_measured_as_configured` fails the suite when either has moved
since — so a rewritten rule or a removed exclusion turns the item's recorded
number red instead of leaving it to be noticed.

It exists because it was needed. An item had five exclusions removed and six
citations rewritten into rules in one commit and was never swept afterwards; its
number was carried forward by re-derivation from a sweep that predated both
changes, and an audit five commits later is what found it. Nothing looked wrong,
because nothing WAS visibly wrong: a removed exclusion deletes the record that
the cell was ever in question, and a rule rewrite is one diff among many.

An item may declare `pending` with a reason instead of a measurement — the usual
bargain. What it may not be is absent, which is the state the check refuses.

**Validate the served prompt every run.** The prompt reaches the grader through
three stages — rubric, generated OLX, dumped idmap — and only the third is what
a run measures. The guard must be BIDIRECTIONAL: a dump taken while an
experimental rule was live is a superset, passes a one-way check, and silently
re-measures the reverted change.

**Read the record, not the score.** Some defects cost nothing and are still
wrong: a leak into student-facing prose, a verdict of `incomplete` on an empty
field, a box credited for its neighbour's words. Print a whole record
occasionally.

---

<!-- qc:QC.2a-1 -->
## 2a-1. NEVER LET A SLICE-BOUNDED EDIT CHOOSE ITS OWN END

**Every programmatic edit to a `.py` file in this package goes through
`editguard.safe_write(path, text, dropping=())`.** It refuses the write if a
top-level definition or `Class.method` would disappear without being named in
`dropping`, and refuses just as hard if a name you DECLARED you were dropping is
still there afterwards -- that means the edit landed somewhere other than where
it was aimed.

**This is not a style preference. It is the third occurrence in two days.**

| the edit | what it ate | how it was found |
|---|---|---|
| rewrite one `GOLD_CODE_KNOWN` entry, sliced to "the next dict key" | the closing brace, a comment, and `GOLD_SLOT_BOUNDS_KNOWN`'s declaration | a NameError in `--preflight`, days later |
| the same slice | `GOLD_SLOT_BOUNDS_BUDGET` | the next `--preflight` run, after the table had been "restored" |
| replace `probe.py`'s helpers, sliced by index to the next anchor | `_slot_aliases`, `_OPERANT_GATE` | seconds, by luck: the next command imported the module |

**The file parsed every time.** `ast.parse` proves syntax, not survival, and a
module that parses while missing a table is worse than one that will not import
at all -- the first symptom of the `GOLD_SLOT_BOUNDS_KNOWN` loss was
`GOLD_CODE_KNOWN` loading seven keys instead of five, which WAS noticed, called
unexplained, and moved past. Anything unexplained in a declaration table is a
deletion until proven otherwise.

**Two layers, and both are needed.** `safe_write` cannot see an edit made by any
other route, so `DEFINITIONS.json` holds the inventory of record (1044 names
across 43 modules) and `enforcement.check_no_definition_vanished()` **refuses a
sweep** when a recorded name is gone. Removing something on purpose is one
command per name: `python3 tools/editguard.py --accept MODULE NAME`, which itself
refuses if the name is still defined. There is no bulk regenerate, for the same
reason `DESIGNED_TEXT_SHA.json` has none.

**Prefer an anchored replace to a slice at all.** `s.replace(exact_old, new, 1)`
guarded by `assert s.count(exact_old) == 1` cannot run past its own end. Reach
for index arithmetic only when the region has no unique boundary, and then read
what sits between the two ends before writing.

<!-- qc:QC.2a-4 -->
## 2a-4. BEFORE CLOSING A GOAL, ASK WHAT THE CLOSURE WOULD DROP

**Run `measured.orphans_if_closed("<label>")` BEFORE the closure, re-home whatever
it lists, close, then run the two owner checks again to confirm.** All three
steps: the first is the only one that can see the problem, the last is the only
one that can prove it is gone.

**Why the obvious check does not work.** `wrong_cells_without_an_owner` and
`unstable_cells_without_an_owner` ask whether an OPEN subgoal names a cell. The
entry you are about to close is still open and still naming its cells, so both
read ZERO and the closure looks clean -- then they name the orphans a minute
later, once the record is already inconsistent. This has caught the same person
twice in one day: one closure dropped a cell that way, and another dropped six,
TWO OF THEM WRONG.

**And do not answer it with a regex over the entry's prose.** Tried the same day,
repeatedly, and wrong every time: a pattern over `Item/pN` citations reported
that NONE of the at-risk cells was owned, when preflight named every one of them
within minutes; it missed a WRONG cell entirely; and it reported a cell as
sole-owned when a second subgoal names it too. Entries cite cells in per-item
tables the pattern cannot see (§2b-3).

**A cell can also be orphaned by getting BETTER.** A cell that improves from 6 of
12 to 11 of 12 in a re-sweep loses its owner, because the entries discussing it
were discussing a 6-of-12 cell. The checks ask "is anyone responsible", not "did the
reason someone was responsible go away", so a re-sweep is a second moment to run
them.

<!-- qc:QC.2a-3 -->
## 2a-3. USE THE PREPARED CLASSIFIER, NOT A NONCE ONE

**If a function in this package already answers the question, call it. Do not
write a regex over prose to re-derive what a checked, fire-tested reader already
computes.** The user made this standing procedure after three nonce classifiers
of mine were wrong in a single afternoon and each one produced a confident,
actionable, false answer:

| nonce classifier | what it said | what was true |
|---|---|---|
| regex for gold's change-box charges | two cells are charged on that axis | neither is -- their charges are about a different axis entirely. One was the exact cell a clause of mine had broken, and the classifier would have justified breaking it |
| regex for wording in an item's response boxes | most cells name it | the item's own TEMPLATE contains the phrase -- the flag was matching the scaffold, not the entry |
| regex for `Item/pN` citations, to find which goal owns a cell | three goals named a handful of cells, none of them the ones at risk | entries cite cells in per-item TABLES ("pN  gold ...") under an item heading, which the pattern cannot see. Closing those three orphaned TEN cells, and `--preflight` step 5e named all ten within minutes |

**The prepared readers, and what each is the authority on:**

| question | call this |
|---|---|
| is this cell wrong / unstable, and how often | `measured.cell_bands()` |
| does any open subgoal own this cell | `measured.wrong_cells_without_an_owner()`, `measured.unstable_cells_without_an_owner()` -- run BEFORE a closure, not after |
| is this cell declared, and by which table | `measured.declarations_for(item, pid)` |
| what did a run actually answer | `cross_path.result_cell()` -- never a side's raw fields |
| what question does the grader see | `probe.question_for(item, slot)` |
| does this text leak corpus vocabulary | `leakage.gate()`, `word_findings()`, `verbatim_findings()` |
| is this participant's input trustworthy **whatever the item** | `handouts.suspect(handout)` — handout-wide, and NOT the per-item answer |
| is this cell dropped **on this item** | `measured.exclusions(item)` — wraps `PER_ITEM_EXCLUDE`; see the trap below |
| does gold CREDIT this box, so a rule firing on it is a real cost | `measured.probe_falsifiers(item, slot)` |
| which cells may a probe not read as evidence at all | `measured.probe_unusable(item)` |
| the whole per-cell picture behind those two | `measured.gold_box_status(item)` |
| does prose in the repo still match the ledger | `measured.prose_claims()` |

**A PRE-REGISTERED SET IS A CLASSIFIER TOO, and typing it out by hand is the
nonce version.** Added after a probe hand-typed its own falsifier set and its own
excluded list as literals in the script and got two things wrong at once:

* It called **`handouts.suspect(H)`** for the dropped cells. That reader answers
  *"participants whose input cannot be trusted, **whatever the item**"* and often
  returns `[]`. A per-ITEM drop is seen only by `exclusions(item)`, so the probe
  ran the full cell count while calling it one fewer, and quoted an excluded cell.
  **Typically ONE item in a handout is where the two readers disagree** — which is
  exactly why this survives: it is invisible on every other item.
* It listed a **gold-CHARGED box as gold-credited**, so the rule firing there read
  as a cost. Gold charges that box in its own words, and we already answer
  `wrong_kind` on it in most runs. Refusing it is **agreement**, and the probe
  reported it as damage.

`gold_box_status(item)` now classifies every cell as `excluded`, `no_gold`,
`full_marks`, `charged_slots_known` or `charged_box_unknown`, and the last of
those returns an **empty** credited set on purpose: when gold charges a cell and
the phrase table cannot say which slot, **no box in it may be called credited**,
because we do not know. An empty set means "we do not know", never "gold charged
nothing" — the same distinction `gold_charged_slots` keeps by returning `None`.

**Pass the slot.** `probe_falsifiers(item)` alone still lists the TARGET cell
whenever some *other* slot of it is credited — which happens when gold charges
both boxes of one group while the cell's remaining slots are fine. Read the
pid list from `probe_falsifiers(item, slot)` instead.

**Why a nonce classifier is worse than no classifier.** It answers in the same
shape as the real one and carries none of the review. Every one of the three
above was written to save a minute, produced a table that looked like evidence,
and pointed the work at a wrong conclusion -- and two of them were caught only
because a prepared check contradicted them afterwards. If no prepared reader
exists and the question is worth asking twice, WRITE ONE and fire-test it, which
is what `declarations_for` was on the same day.

<!-- qc:QC.2a-1c -->
## 2a-1c. CLEAN UP THE SCRATCHPAD AS A STAGE OF THE CYCLE, NOT AFTERWARDS

**A scratchpad copy of a package module is live ammunition.** A file named
exactly `enforcement.py` or `agreement.py` in a working directory will be
imported instead of the real one by any script that puts that directory first on
`sys.path` — and it will not error, it will quietly answer with old code.

**What it cost.** A script listing the queued probes did
`sys.path.insert(0, SCRATCHPAD)` then `import enforcement`, and got a stale copy
**1425 lines shorter** than the live module. `DESIGNED_TEXT` was added after that
copy was taken, so the traceback read *"module 'enforcement' has no attribute
'DESIGNED_TEXT'"* — which looks exactly like a table someone had clobbered. Four
shadows were sitting there: `agreement.py` (55 lines behind), `enforcement.py`
(1425), `olx_prompts.py` (138), and `oc_grid.py` carrying a superseded
`derive_oc_ledger` signature. A script importing any of them would have
**measured old code and said nothing.**

This is the same family as a stale idmap or an unregenerated `.olx`: *the thing
you consulted was not the thing that ships.* Those two doors are already
enforced — `check_idmap_is_current`, `prompt_sha` — and this is the third.

**THE CYCLE HAS SIX STAGES, and the sixth is not optional:**

1. build (from `DESIGNED_TEXT`, never a retyped string)
2. `leakage.gate((ITEM,))` **on the built tree**
3. `olx_prompts.py --write` — it REFUSES while a measurement is in flight, and
   that refusal is correct; never `--force` past it
4. confirm the text is in `measured._olx(h)` and `prompt_sha` MOVED — a rubric
   edit alone ships nothing
5. `faithful_probe.py ITEM <cells>` — the sweep's own envelope
6. **keep or revert, then DELETE the snapshot and any module-named copy**

**Name a snapshot so it cannot shadow.** `<module>.before_<tag>.py` or
`<module>.pre_<tag>.py` — those basenames cannot satisfy an `import <module>`, so
a cycle may hold one open until it keeps or reverts. An EXACT basename match never
may. `enforcement.check_no_module_shadow_in_scratchpad` reports exact matches
only, and is wired into the sweep gate: a sweep will not start while one exists.

<!-- qc:QC.2a-1b -->
## 2a-1b. A PROBE MUST REPRODUCE THE LEDGER BEFORE ITS RESULT MEANS ANYTHING

**Run the UNMODIFIED text in the probe's own envelope first, and require it to
give the answers the ledger already records. If it does not, the probe is void
and no edit may be attributed through it.** `probe.control_gate(item, slots,
observed, runs=)` — 0 to trust, 1 to refuse — against
`probe.recorded_answers(item, slots, cells)`.

**Every other control in this package asks "is this the right STRING?"** —
`DESIGNED_TEXT_SHA` (designed == shipped), `question_for` + `field_sha` (probed ==
shipped), `prompt_sha` (baseline == measured). **None of them asks "is this the
right PROMPT."** A shipped assembled prompt runs to thousands of characters
carrying a dozen checklist lines — every slot of the group, the advisories, the
gates, the deduction codes including the charge gold actually levies on the
target cell, and a `confident` slot. One slot's rule text can be **as little as a
tenth of that.** A probe that hand-builds an envelope around the correct string
is asking a different question, and it will answer it confidently.

**What it cost before the guard existed, all in one day.** A retrospective
gate over the recent probes (`scratchpad/retro_gate.py`, no calls) put **six of
seven readable ones VOID**:

**Every probe this rubric has run is tabulated in the course half.** The
shape to read for is a probe that is CLEAN on its non-target cell-slots:
that is the one whose conclusion a sweep is not needed to confirm.

**`None` is absence, not a verdict.** `measured.slot_answer` returns `None` for a
slot the shipped prompt never answered, and an early version of the gate stringified
that into a baseline of `"None"` — which would have **falsely refused** every probe
of a new slot. The gate now skips those and says so.

**A disagreement does not prove the envelope drifted.** Either it drifted, or the
candidate moved a cell the probe reported as held — and the probe's own falsifier
report was then wrong. Both disqualify the verdict, which is why the gate is
sound either way. Label such a probe "cannot support its verdict", not "envelope
drift".

**Two rules the gate itself has to follow.** A cell whose LEDGER answer is
unstable cannot convict an envelope — four probe runs can differ from a pooled
mode by sampling alone — so only a mode the shipped prompt holds at **75% or
more** counts, and the rest are printed and skipped. And a probe that PASSES is
not thereby correct: the envelope may still differ where the ledger is silent.
Passing means *not disqualified*.

**A VOID probe's verdict cannot be cited for or against anything, and that
includes DEAD ON REACH** — an unfaithful envelope is exactly what manufactures a
false negative. A route a VOID probe never reached is **unmeasured, not dead**.

<!-- qc:QC.2a-2 -->
## 2a-2. CHECK A PROPOSED RULE AGAINST ALL VALID GOLDS, BEFORE THE PROBE

**Read gold's charge on EVERY valid cell of the item and write the two sets down
-- the cells gold charges on your criterion, and the cells it credits -- before
you word anything.** It costs no calls, it is the only thing that tells you what
the rule is allowed to do, and the user made it standing procedure after three
edits in one day were measured against hand-picked cell sets.

**What a hand-picked set hides.** A report slot was probed on six cells, passed,
swept, and fired on FOUR MORE the probe had never looked at -- one of which
fell to zero. The all-cells probe that found them cost a fraction of what the
sweep that would have found them cost. And the same free readout showed gold names that
criterion exactly ONCE in the whole item, which is a standard no probe can give
you.

**Read the FULL gold text, never a summary and never a keyword match.** Two
errors in one hour, both mine, both from not doing this:
* Reading truncated one-line notes, I told the user that gold never charges a
  particular ground on an item -- and the cell's full note says the opposite
  outright.
* A regex for one group's charges matched a phrase that also appears in another
  group's, so two cells were reported as charged when neither is. One of them was
  the exact cell a clause of mine had broken; the classifier would have justified
  breaking it.

**READ EACH CELL IN THE LIGHT OF THE DECLARATIONS, NOT AGAINST RAW GOLD.** The
standard is gold AS AMENDED, and two tables amend it in opposite directions:

| table | what it means for the expectation |
|---|---|
| `handouts.GOLD_DIVERGENCES` | **our answer is the endorsed one**; gold is the outlier. The cell must keep OUR verdict, so it is a FALSIFIER for any new rule -- a fire there is a regression |
| `measured.GOLD_SLOT_DISAGREEMENTS_KNOWN` | recorded and ratcheted: acknowledged, NOT endorsed. Still a live target |
| `CORRECTED_GOLD`, `GOLD_CODE_KNOWN`, `GOLD_SLOT_BOUNDS_KNOWN`, `SILENT_GOLD_DIVERGENCES`, `GOLD_CEILINGS` | each replaces or bounds the expectation for the cells it names -- read them all before writing the table |

**Bought in the same hour.** A rescore was proposed for a cell to bring it to
gold's figure -- and a standing declaration already records OUR credit as the
reading we endorse, gold having applied the item's pedagogical point beyond the
literal text. The proposal would have contradicted that declaration to chase a
number, and it would have made a declared cell into a defect. A NEIGHBOURING cell
IS live, because it sits only in the ratchet table, which records a disagreement
rather than blessing it. Same item, same criterion, opposite
dispositions -- and nothing in the raw gold distinguishes them.

**The output is a table, and it is the pre-registration.** One row per valid
cell: what gold charges, what your criterion predicts, and whether they agree.
Where they disagree, either the criterion is wrong or the cell is a gold
divergence to declare -- and deciding which is cheaper before a sweep than after.
Cells with NO gold are invalid for the check and must be named as such rather
than quietly dropped.

**Then probe on all valid cells, not on the interesting ones.** The probe's cell
set should be the same set the table covers, so a fire anywhere shows up.

<!-- qc:QC.2a -->
## 2a. PROBE BEFORE YOU SWEEP

**Before spending a sweep on a new rule, slot or pick, ask the grader the
question ON ITS OWN, on a handful of cells including the target, and see whether
it can answer it at all.** A sweep costs ~230 calls per item and answers "did
the item total move". A probe costs ~30 and answers the prior question — *will
the grader even apply this?* — which is what most failed edits here actually
died of.

**GET THE QUESTION FROM `probe.question_for(item, slot)`. Never retype it.**
That function lifts the string out of `olx_prompts.build_web_prompt()` -- the
same call the sweep renders from -- so a probe cannot ask something the sweep
will not. Retyping is what cost a whole sweep: a probe passed 23 of 24, the slot
then shipped with a `desc` that dropped the question's comparison clause and
turned a yes/no into a which-one, and the sweep over-fired on nine cells.
Reconstructing the string by hand is not safer for being careful -- the checklist
note is `rule` OR `SLOT_NOTES` OR `desc`, in that order, and on 20 of the 68
asked slots the obvious `rule or desc` shortcut lifts the wrong text.

**Both graders count.** A slot answered deterministically is measured on the
sweep and judged in the ledger exactly like an LLM-answered one; only the grader
differs. `question_for` returns `kind="derived"` for those, lifting the
`expect`/`equals`/`derived`/`maps`/`forbid` clause from the shipping `.olx`, and
`kind="composite"` for a rubric criterion the sheet answers under other names
(the four `is_*` types, `is_operant_conditioning`'s five-part gate, the count
aggregates behind `reason_*`/`sentence_*`/`example_*`). Probe a derived slot by
EVALUATING its rule over the cells: no backend, no calls, no rate limit, which
makes it the cheapest probe available and the one most worth writing. All 116
credit slots resolve; none is unprobeable.

**Then leave a receipt.** `probe.write_receipt(item, slot, q, cells=..., verdict=...)`
records the sha of the string actually asked, and
`enforcement.check_probe_receipts_match_shipping()` **refuses a sweep** whose
probe measured text that no longer ships. A stale probe is worse than no probe,
because it reads as evidence.

**The failure a probe catches is REACH, and it is the common one.** Three edits
were once measured and reverted in a single day, and none of them was wrong
about the text:

**Three diagnoses of this kind are tabulated in the course half.** Each was
sound, and each cost a sweep to discover that the grader already had what
the edit was adding.

Each diagnosis was sound. Each cost a sweep to discover that the grader had a
competing true reading and preferred it. A probe would have shown that for a
tenth of the calls.

**What a probe is.** A standalone script that sends the new question and the
cell's own text through the SAME backend the app uses (`backends.make_backend
("lo")`, gpt-5-mini via localhost), with a schema forcing the answer, N runs per
cell. It touches NOTHING in the tree — no rubric edit, no `--write`, no `.olx`
lock — so it cannot disturb a queued sweep and needs no revert.
`scratchpad/probe_q4b_report.py` is the worked example.

**Choose the cells the way a sweep chooses controls**: the target, plus the
negatives that must NOT fire. A probe whose only cell is the target proves
nothing — if the question is loose enough to fire everywhere it will fire on the
target too.

**How to read it, and the asymmetry is the point:**

- **Fails on the target** → *decisive*. If the grader cannot answer correctly
  with nothing else to do, it will not do better inside a checklist of ten
  questions. Do not spend the sweep.
- **Fires on a negative** → the definition is wrong, and that is free to fix and
  re-probe.
- **Passes** → *necessary, not sufficient*. The probe asks in ISOLATION; the
  shipped prompt asks amid competing questions. A pass licenses the sweep; it
  does not predict it.

**PROBE THE EXACT STRING THAT WILL SHIP — not a paraphrase of the same
question.** This is the one rule here bought with a wasted sweep. A report slot
was probed with a carefully written question and then built with a `desc` that
dropped its comparison clause and turned a yes/no into a which-one. The probe
passed 23 of 24; the sweep over-fired on nine cells and cost ~230 calls; and a
re-probe with the SHIPPED string reproduced the failure standalone in 24. The
probe was honest about the question it asked and the question it asked was not
the one that shipped.

So build the slot FIRST, render the prompt, and probe the rendered text — or at
minimum diff the probe's string against the `desc` the checklist will show. And
note WHICH field you probed: the grader answers the checklist line, which comes
from `desc`; a `rule` rendered elsewhere in the criteria section is present and
in the wrong place. A short desc plus a long rule is the house pattern and it is
safe only when the short desc is self-contained.

**It does not replace the free work that comes first.** Read the fixture, read
the cell against its siblings, and check the prediction against the text — a
prediction that fails on paper never needed a probe either. The order is:
read, predict, probe, sweep.

<!-- qc:QC.2b -->
## 2b. TRY THE STRUCTURAL FIX FIRST

**When a cell resists, change the SHAPE of what the model is asked, not the
wording of the question. Structural fixes have worked; wording changes mostly
have not.** Reach for prose only after a structural option has been tried or
ruled out, and say which.

The record is one-sided:

* An item **fixed by ADDING A REQUIRED SLOT**, after prose attempts failed. The
  README's own recommendation.
* A gate that **absorbed four measured prose attempts**, all neutral, all
  reverted. BACKLOG.md records the untried lever as "add a NEW required slot
  rather than re-describing an existing gate".
* A cell **fixed by the `forbid` PRIMITIVE** -- a new rule shape -- not by
  re-describing the judgement.
* A counted slot that **cost EIGHT configurations and ~550 calls** of wording
  changes. One cell was won early and another never landed across all eight
  configurations. Three "isolate the mechanism" probes all
  scored WORSE than the baseline they were derived from, and the one run that
  did land was never replicated. The structural option -- ask the repeats SEPARATELY instead
  of collapsing them into one count -- sat unexamined the whole time.

Why it works, when it does: prose can only move a threshold on a judgement the
model is already making in one step. A structural change alters WHICH judgements
are made. A counted group is the clearest case: `counts=` forces one aggregate
answer, so two cells needing opposite thresholds cannot both be satisfied by any wording --
that is arithmetic, not rhetoric. Asked per slot, each candidate is judged on its
own eligibility, and "is this DIFFERENT from what I already credited" becomes a
local comparison instead of a global counting principle.

The structural inventory, before writing prose: is there a primitive that says
this (`forbid`, `equals`, `expect`, `requires`, `onlyif`, `cover`)? Can a slot be
added? Can an aggregate be split? Can a derived check replace a judgement? If the
answer to all of those is no, then write prose -- and note in the commit that the
structural options were considered.

* **One item** is now the longest record of this, and it confirms the rule while
  correcting two things about how to apply it. Seven measured attempts took it
  from 15 of 20 to a 19.7 mean. The structural moves carried it: splitting
  the `counts` aggregate into per-box slots (+2 cells), a `forbid` conjunction
  for one cell, an operand slot tied by `requires` (+2). The prose-only attempts
  moved one cell each at best.

<!-- qc:QC.the-recipe-book-which -->
### The recipe book: which primitive expresses which logical shape

**Most structural fixes were missed not because prose was preferred but because
nobody knew a primitive could say the thing.** `primitives.json` lists nine
attributes with a one-line summary each; it does not say which logical shape each
one is FOR. This is that mapping. Each row is a pattern in the item, the attribute
that expresses it, the OLX attribute syntax, and the measured pitfall.

| you want to say | use | OLX syntax |
|---|---|---|
| fail when several answers hold TOGETHER (AND) | `forbid` | `forbid="key:a=v1,b=v2,c=v3"` |
| met if ANY of several grounds holds (OR) | `forbid` over the negations | `forbid="key:g1=absent,g2=absent,g3=absent"` |
| B counts only while A holds | `requires` | `requires="B:A[:lenient,...]"` |
| B may be charged only when A is satisfied | `onlyif` | `onlyif="B:A"` |
| two model answers must agree | `equals` | `equals="key:left:right[:lenient]"` |
| one classification must match an authored value | `expect` | `expect="key:pick=value"` |
| a pick maps to one of SEVERAL named failures | `maps` | `maps="key:pick:v>verdict,..."` |
| read a fact off the page instead of asking | `derived` | `derived="key:kind:fields:args"` |
| N interchangeable repeats, counted once | `counts` | `counts="count_key:m1,m2"` |
| two slots must cover a set of labels, either order | `cover` | `cover="k1,k2:labelA,labelB"` |
| a failure that takes the whole item | a GATE | `!key` in `slots=` |

**The OR recipe is the one worth spelling out**, because it is not obvious and it
is what a compound slot holding ALTERNATIVE grounds needs. There is no
disjunction primitive. You get one by De Morgan: declare an operand slot, and
`forbid` it only when EVERY ground is absent —
`NOT(A or B or C)` is `(NOT A) and (NOT B) and (NOT C)`. The operand then reads
`met` whenever any single ground holds, and `requires` ties the scored slot to it:

    slots="...|g1:...:unclear|g2:...:unclear|g3:...:unclear|mech:Any ground holds"
    forbid="mech:g1=absent,g2=absent,g3=absent"
    requires="scored_slot:mech:unclear"

That is three simple questions plus two declared rules, in place of one compound
judgement. Where it has been used it produced the item's best measured result.

<!-- qc:QC.choosing-between-them-and -->
### Choosing between them, and the pitfalls each one has

* **`counts` versus separate slots.** `counts` asks ONE aggregate question, so two
  cells needing opposite thresholds can never both be satisfied by any wording —
  arithmetic, not rhetoric. It has cost one item eight configurations and ~550
  calls, and another five cells. Use it only where the repeats really are
  interchangeable AND no cell needs a different threshold from another. **Where
  the answer is one prose block it also drives the FIXTURE**: score.py's
  counted-group distribution rebuilds the on-screen boxes,
  so removing a `counts` group changes the INPUT. See §1.
* **`onlyif` caps the floor.** It stops a second slot charging on top of a first,
  which is right when gold charges one fault once — but it also makes the summed
  deduction unreachable. It has made a `BLANK` deduction impossible, and the
  arithmetic audit reported `CANNOT ZERO`. Check the floor after adding one.
* **`requires` versus `forbid` on a slot the MODEL judges.** `forbid` computes the
  verdict and so strips the key from the schema — layer it on a judged slot and
  the model stops being asked. `requires` conditions a verdict the model still
  gives. This is the single distinction that has cost an item a whole attempt.
* **`expect` and `equals` need an operand that is answered.** Both read
  `refers_to` in preference to `verdict`, so the operand must be a classification
  slot, and a blank operand is handled by `lenient` rather than by failing.
* **`derived` kinds are fixed**: `plots`, `complete`, `present`, `contains`. A rule
  naming any other kind is dropped silently on both sides.
* **Check the item's MARGIN before trusting a slot's stability.** Where every
  gold row is one of two values, a cell at the lower one tolerates exactly ONE
  charge: a second overshoots however defensible it is. A slot that is 83% stable
  is enough to lose such a cell in 2 of 12 runs, when a sibling slot is already
  correctly charged. On an item with no margin, slot stability and item accuracy
  are the same question; on an item with several increments they are not.
* **A gate is discovered by single flips; a conjunction is not.** That asymmetry is
  why the same three-way rule raises a probe-reach finding when it drives a slot
  and none when it drives a gate — see `olx_prompts.PROBE_REACH_LIMITS`.

<!-- qc:QC.read-the-excludeskeys-column -->
### Read the `excludesKeys` column before concluding a primitive cannot compose

**A primitive that COMPUTES a verdict strips its key from the web schema; one
that CONDITIONS a verdict does not.** `primitives.json` records which is which,
and the split is not arbitrary: `equals`, `derived`, `counts`, `expect`, `forbid`
and `maps` all compute an answer, so asking the model for it too would give one
slot two sources of truth. `cover`, `onlyif` and `requires` constrain an answer
the model still gives.

I once needed to add a computed condition to a slot the model judges, reached
for `forbid`, found it would stop the model being asked that slot at all, and
concluded the composition was impossible -- then fell back on prose. It was not
impossible. `requires` is documented in the registry as the mirror of `onlyif`,
does exactly that composition, and I had used its twin two steps earlier without
noticing the pair. **Generalising a limitation from one primitive to the
mechanism cost an attempt and a prose fallback taken on a false premise.**

<!-- qc:QC.a-disjunction-is-not -->
### A DISJUNCTION is not a conjunction: split only what is independently statable

`parse_forbid`'s docstring makes the case for splitting a compound judgement:
"asked one answer at a time it was stable, asked as one judgement the model
resolved the tension by re-reading which clause was which." That argument is
about a **conjunction of conditions**, which is what `forbid` exists for.

A compound slot held a **disjunction of three alternative grounds**, and
splitting it made the item WORSE the first time -- 20 to 19, with effective
one ground's accuracy falling from 96.7% to 93.3%, twelve false denials against six.
Asking "is there ANY mechanism" is an easier question than three separate
near-misses. But the eventual fix WAS the split, once one ground's wording was
repaired. The rule that survives both results:

> Split a compound judgement when each ground is independently statable, and
> then MEASURE EACH GROUND'S OWN RATE. A ground that answers `met` on 43.8% of
> observations is not a criterion the model can apply; it is the reason the
> split failed.

<!-- qc:QC.2c -->
## 2c. PROFILE THE ERRORS BY SLOT AFTER EVERY SWEEP

**A median says how many cells are wrong. It never says which JUDGEMENT is
wrong, and those point at different work.** `measured.py --record` now prints
the profile automatically; `measured.py --errors ITEM ARTIFACT` runs it alone.
Not optional, because nobody runs a diagnostic at the moment they believe they
already know the answer.

Three tables, three different questions:

* **DIRECTION** — over- versus under-credit. One-sided means a THRESHOLD is set
  wrong. Two-sided means the judgement is unstable, and no rewrite fixes that.
* **BY SLOT** — how often each slot is unsatisfied, split by whether the CELL was
  right. A slot unsatisfied mostly in CORRECT cells is doing its job; a slot that
  tracks the errors is the lever.
* **DRIFT** — how often a slot's verdict changes across runs of the SAME cell.
  High drift means the prompt asks something the model cannot answer twice the
  same way.

The case that produced this rule: an item was worked for a day on its merge
rule, across eleven configurations and roughly 900 calls, because three misses
looked like merge failures. The profile over the SAME artifact that was sitting there
the whole time:

    DIRECTION   correct 101 (84%)   over-credit 16 (13%)   under 3 (2%)
                one-sided: a threshold is set wrong, not unstable
    COUNTS      said 3, gold 2  x8      <- the merge problem
                said 3, gold 1  x6      <- an EXCLUSION problem, untouched
                said 2, gold 1  x2      <- the same
    DRIFT       confident 15 cells, reasons_given 5 cells

Sixteen of seventeen count errors were OVER-counts and eight sat on cells
crediting ONE reason — an exclusion problem roughly twice the size of the merge
problem, and not addressed by any of the eleven configurations. Reading the item
median, or even the three failing cells, could not have shown that; the
distribution of error DIRECTIONS did, immediately.

Two further readings that fall out of it for free: a slot with high `unmet` but
almost all of it in CORRECT cells is not the problem however much it dominates
the eye (`confident`, 99 unmet, 83 of them in cells scored right), and DRIFT
identifies cells that no wording can fix before calls are spent trying.

<!-- qc:QC.and-profile-the-grounds -->
### And profile the GROUNDS, not just the slots — the item total lies about why

**When a rule offers several grounds, measure each ground's own met-rate. The
item total cannot tell you which one failed, and reading only the total will make
you revert the right change.**

One item is the case, and it cost two attempts. A three-way split of one compound
ground took the item from 20 to 19, so I reverted it and recorded that the split
had failed on principle. The per-ground data — which was in the same artifact —
said something different:

    names_enabler        62.5% met
    states_size          43.8% met     <- the actual defect
    names_plan_content   49.2% met

    cell A (gold 4, must be charged):  absent on EVERY ground
    cell B (gold 6, must be credited): no ground at all

Asked separately the model was **unanimous and correct** about cell A, which the
compound question got wrong 5 times in 12. What the split actually cost was cell
B, whose only real ground is a bare directional change that one ground's wording
did not admit. One ground's wording, not the split.

Worse, reading the total led me to tell the user the boundary between two cells
was "at the noise floor" and to recommend stopping. The per-ground data showed one
of those cells was not marginal at all. **Fixing the one ground and re-running the
same split produced the item's best result: median 20, mean 19.7, four wrong
cell-runs in 240.**

So after a sweep of a multi-ground rule, print three things per ground: its
met-rate over all observations, its answer distribution on the cells the rule
exists to decide, and whether any cell that must be CREDITED has no ground at
all. That last one is the cell-B check, and it is the one that says a split is unsafe
before it costs a cell.

<!-- qc:QC.its-companion-refusals-which -->
### Its companion: `--refusals`, which asks a different question

`--errors` asks which slots are unmet in cells that scored wrong. That is not the
same as asking whether a refusal was WRONG, and the difference is not academic: a
refusal can sit in a wrong cell while being correct, because the cell is wrong for
the opposite reason. A box can have 15 refusals all sitting in wrong cells,
which reads as a rule that never fires correctly — but most of them may be one
participant where gold charges BOTH boxes, so the refusal is right and merely
incomplete, and crediting the box moves the cell further from gold.

`measured.py --refusals ITEM [SIDE]` counts each refusal against **gold's own
itemisation**: corroborated when gold's comment names that slot, CONTRADICTED when
it itemises the cell and does not, and undecidable when the comment cannot be
itemised at all. Undecidable is reported separately rather than folded into
either, for the same reason `gold_charged_slots` returns None instead of an empty
set — not knowing is not the same as knowing there was nothing.

Run it before using a precision figure to justify a rule. On three items it has
returned ZERO contradicted refusals: every refusal gold has an opinion about, gold
agrees with, and the apparent collapse is entirely gradient cells plus silent
full-marks rows.

<!-- qc:QC.2d -->
## 2d. REPORT THE SPREAD; THE HEADLINE IS A PER-CELL MEDIAN

**The ledger's item figure is a median taken PER CELL and then counted, so a cell
right in seven runs of twelve is recorded as simply right.** On an item with
several unstable cells that overstates badly, and it is the most flattering
summary available — which is why it is the one that gets quoted.

An item recorded **20 of 20** on a sweep whose twelve runs scored
A run series can have a median the item's increment cannot even score, a
flattering single-side pick, and a reported progression that the run-level
scores never made. In one session the same mistake was made three times.

`measured.record()` now prints `sweep_summary(item)` on every recording, so the
honest figures arrive with the headline rather than on request:

    CELLS CORRECT PER RUN
      18 18 18 18 18 18 19 19 20 20 20 20
      range 18-20 of 20   median 18.5   mean 18.8 (94.2%)
      18 x6, 19 x2, 20 x4
    PERCENT CORRECT BY CHECK
      verdict  180/180  100.0%   how_1  179/180  99.4%   how_2  180/180  100.0%
      determinate on 15 of 20 cells; INDETERMINATE on [1,13,14,15,16]

Four rules that block the three mistakes above:

1. **Quote the range and the mean beside any median.** They can differ by more
   than a cell, and the mean is what a student would actually get.
2. **The median it prints is over ACTUAL RUN SCORES.** Both figures are medians;
   only one describes outcomes that occurred.
3. **Never quote a single-side median.** `_EVALUATED_SIDES` is
   `(olx+python, paper, paper_opus)`; a six-run median of a 3–3 split lands on a
   value no run produced.
4. **When a change "gains a cell", ask whether it gained a STABLE cell or pushed a
   coin flip across the median line.** The second is not a gain. The honest
   progression above is 15 → 18.8 mean, not 15 → 20.

Per-check accuracy is claimed only where gold determines it — gold awarded the
maximum, so every check must be met, or its comment itemises. Cells where gold
charged and named nothing are printed **INDETERMINATE**, never guessed.

**GATES are in the table, and their accuracy rests on a SMALLER sample than the
point-bearing slots' — say so when quoting it.** A gate carries no points and no
grader phrase can name one (§2k), so on a partial-credit cell there is nothing to
compare it against and it is left out rather than defaulted to expected-to-pass.
On a FULL-MARKS cell the expectation is determinate for any kind of check —
full marks implies every one of them passed — so that is where a gate's accuracy
is measured, and that is also where a gate false-positive costs a whole item. A
gate reading 125/132 is therefore 132 observations drawn from fewer cells than
the same figure on a scored slot.

<!-- qc:QC.2e -->
## 2e. READ WHAT IS ALREADY RECORDED BEFORE FORMING A HYPOTHESIS

**Before touching a rule, read the comments around it, the draft for that item,
and the goal entry. Prior measured work lives next to the thing it measured, and
it is usually more specific than anything you are about to guess.**

The case: one counted slot absorbed ELEVEN configurations and ~900 calls in
one day, aimed at a merge rule. The comment block directly above the component
already said, from earlier measured work:

* gold's rule is **CONDITIONAL** -- one kind of reason is credited outright, and
  a second kind only where the response offers none of the first;
* every cell with gold < 3 was already classified: one has exactly one harm among
  four background statements and two goal-benefits and scores 1; two have no
  harms and 2 benefits each and score 2; one has none and one benefit and scores
  1;
* **one of them was already diagnosed, and not as a merge problem** -- "the model reads
  a background statement as one of the counted items, so the count is 1 and tier one
  applies, giving 1 where gold wants 2".

The first change of the day replaced that conditional with a flat sum, which is
why one cell collapsed and never recovered under any later wording: a measured
reconstruction of gold's structure was deleted as if it were a defect.

Checking is cheap and mechanical:

    sed -n '/"what": "THE_SLOT"/,+3p' rubric_hN.py     # the component
    sed -n '/THE_SLOT/,-40p'          rubric_hN.py     # the comment ABOVE it
    ls drafts/ && grep -rl ITEM drafts/ BACKLOG.md GOALS.md

A rule that looks arbitrary usually is not. If the recorded reason is wrong, say
so and measure against it -- but do not discover it after the fact.

**ENFORCED, not advised.** `olx_prompts.py --write` prints the prior record for
every item whose prompt text it changes: the substantial comment blocks inside
that item's rubric entry, anything naming it in `drafts/`, `BACKLOG.md` and
`GOALS.md`, and the structural inventory §2b asks for -- which primitives the
item already carries and which are available and unused. You cannot change a rule
and regenerate without the record being put in front of you at the moment it
matters, which is the only moment it does.

`check_the_record_is_pushed_at_the_change` guards the guard: it asserts the
writer still calls the hook, that the hook still reports all three sources plus
the inventory, and that it does not swallow its own lookup failures. That last
assertion exists because the first version of the hook raised NameError on every
lookup into a bare `except: pass` and cheerfully reported an empty record — the
failure mode of §2e occurring inside the mechanism enforcing §2e.

Of the three disciplines in this section, only §2c and §2e are machine-enforced.
§2b rides along on §2e's hook (the inventory is printed with the record) but
nothing checks that the inventory was ACTED on; that remains a judgement.

<!-- qc:QC.2f -->
## 2f. EVERY WRONG CELL HAS AN OWNER, AND THE AUDIT CHECKS IT

§2c profiles the errors after a sweep. This is what to do with the profile: every
cell we score wrong is either being worked by an open subgoal or is declared, and
nothing sits in between. The audit enforces it on every run
(`enforcement.check_every_wrong_cell_has_an_owner`), so it is not a pass anyone
has to remember to do.

**Why it is a check and not a procedure.** The accounting behind it was built by
hand: itemise gold's comment for all 109 cells, list every cell wrong at the
median, and walk each one against the subgoals until nothing is unowned. That
worked. The problem is that its product decays SILENTLY. Cells move as prompts
change. A subgoal closes and takes with it the only home some cell had. A
finished list reads exactly the same whether or not it still describes the
corpus, so nothing about a stale accounting looks stale — which is the same
failure §2e describes for prose, and the same one
`check_prose_numbers_match_the_ledger` exists to catch.

**The hand pass had a defect care would not have caught.** It compared every cell
at the python median, because that is the default side. Its first automated run
found five cells the python gets right and the OLX gets wrong, all six runs on
each side — which no amount of diligence on a one-sided reading could have
surfaced. They became their own subgoal. Read BOTH sides; `measured.SIDES` is
the list, and a cell wrong on either is a cell we get wrong.

**Both directions are reported**, because the accounting rots in both:

* a wrong cell no OPEN subgoal names — work with nowhere to be recorded;
* a cell a subgoal is ABOUT that now scores RIGHT — evidence that moved out from
  under a subgoal still being worked. This arm closed a subgoal whose
  over-charge had gone.

**Three exemptions, each a real distinction rather than a way of reaching zero:**

1. A cell in `GOLD_DIVERGENCES` is a DECLARED miss. A declared miss is not an
   orphan.
2. A cell declared at slot or code level stays live EVEN WHEN ITS TOTAL AGREES.
   Compensating slot errors that sum to the right total are the whole reason the
   slot accounting exists; retiring them on a matching total would discard
   precisely the cells that exist because the total hides them.
3. Only a TITLE mention makes a subgoal ABOUT a cell. Body mentions are
   routinely history or controls — an entry names cells BECAUSE we score them
   right — so the strict form is used for the "evidence has moved"
   arm and the generous form for ownership.

**It must stay cheap.** It reads the recorded ledger and GOALS.md, spawns
nothing, and costs about 0.1s inside the audit (0.44s cold). Do not memoise the
GOALS.md parse to shave that: the self-test works by breaking something and
confirming the audit still detects it, and a cache outliving a mutation turns a
real detection into a silent pass. If it ever does need memoising, do it behind a
seam the self-test can replace, as `_handsplit_tables` does.

**When it fires, the answer is one of three things** — fix the cell, file a
subgoal that owns it, or declare it with a reason. Silencing it is not on the
list.

<!-- qc:QC.2g -->
## 2g. A python/OLX DIFFERENCE AT THE MEDIAN IS NOT YET A DIVERGENCE

Two sides are compared at their recorded medians, and the median over six runs is
a STEP FUNCTION at exactly the halfway point. On a cell the model gets right about
half the time, 3 of 6 puts the median on the right answer and 2 of 6 puts it on
the wrong one — so a single observation decides which engine is recorded as
correct, and the ledger shows a clean "python right, olx wrong" for a cell where the
two engines are behaving identically.

This is not hypothetical. A subgoal was filed as "five cells the python gets right
and the olx gets wrong" and measured out as ONE divergence and four coin flips:

    cell   gold   python matches   olx matches   medians
    A       4.0      3 of 6         2 of 6     python 4 / olx 0
    B       4.0      3 of 6         2 of 6     python 4 / olx 2
    C       4.0      3 of 6         2 of 6     python 4 / olx 2
    D       0.0      5 of 6         3 of 6     python 0 / olx 2
    E       3.0      0 of 6         6 of 6     python 5 / olx 3

Three differ by ONE observation. Only the last is a real engine difference, and it
is obvious once the rate is read rather than the median: 0 of 6 against 6 of 6.

**Before treating a python/olx difference as an engine defect, read the per-run
agreement rate on both sides.** If they are within a run of each other, no engine
is at fault and the cell belongs to whichever subgoal owns its unstable slot —
`measured._runs_doc(item, side)` has the per-run results and the per-run verdicts.

Two traps inside that check:

* **Compare `refers_to` as well as the verdicts.** Cell D's olx runs have
  IDENTICAL verdicts and scores of 0, 0, 2, 0, 2, 4: the movement is entirely in
  the classification answers rather than the verdicts. A flip
  detector reading only `verdicts` reports the cell as stable and turns a
  scoring-path question into a mystery.
* **The direction can invert.** A cell was python-right/olx-wrong until an
  unrelated slot left the sheet, and is now olx-right/python-wrong, stable
  both ways. A recorded direction is a fact about a measurement, not a property of the
  cell.

The ownership check in 2d reports a cell wrong on EITHER side, which is right —
the cell is still not being scored correctly. What this section governs is the
diagnosis that follows, not whether the cell gets an owner.

<!-- qc:QC.2h -->
## 2h. SPEND NOTHING ON WHAT A FREE CHECK CAN SETTLE FIRST

**Every rule in this guide that can be tested without model calls belongs in the
PREFLIGHT, not in the reader's memory.** A sweep costs hundreds of calls and an
hour; the checks that would have stopped a bad one cost seconds and no calls at
all. The policy is therefore not "run the checks when you remember" but: before
anything spends, run everything that can run for free, and treat a finding as a
refusal rather than a note.

This is implemented, not aspirational. `agreement.cheap_checks_gate` is the
structural suite and both harnesses now run it -- the app side did NOT at first,
which meant a finding that stopped one engine silently let the other
through. Alongside it, `check_idmap_is_current` refuses a dump that predates the
current prompt, `check_fixture_is_not_corrupt` refuses a fixture whose boxes are
not the student's words, and the leakage and probe gates refuse before the first
call.

**The bar for adding a check to the gate is not "could this break the sweep".**
It is "could this make the sweep WORTHLESS", and that includes making its reading
wrong rather than its execution fail:

* a fixture whose boxes hold a placeholder rather than the response measured a
  placeholder, and the change under test read as refuted when it had never been
  tested -- 120 calls;
* an idmap dumped while a reverted rule was live re-measured the reverted rule --
  a whole sweep;
* gold read from the wrong handout's sheet, or a slot diff taken against a
  vocabulary gold cannot use, produce a clean-looking number answering a
  different question. Both are now in the gate for exactly that reason.

**And the cheapest check of all is reading.** Section 2l's all-cells pass makes no
calls and killed a rule that had already survived every mechanical gate. Before
launching, ask what the sweep is supposed to settle, and whether anything on disk
already settles it -- the artifacts, gold's comments, the responses themselves.
Several findings in this record were established from artifacts alone, with no
calls spent, after being proposed as sweeps.

<!-- qc:QC.2i -->
## 2i. RE-READ EVERY CELL A SUBGOAL OWNS BEFORE ACTING ON IT

**A subgoal's cell list is a claim, and it decays.** Cells get corrected gold,
the instrument that assigned them gets fixed, other cells get resolved by
unrelated work. Before writing a rule for a subgoal, read out every cell it owns
against current data and ask of each one: *is this still an instance of this
problem?* The ones that are not go to another subgoal with a stated reason.

It is worth the pass because it changes the rule, not just the bookkeeping. On
one item the list of eighteen cells where the gate fired turned out to be:

* THIRTEEN that cost nothing -- eight blank answers where every check fails
  together, five structural failures where gold also gives zero. They were most
  of the refusal count the subgoal had been filed on, and every one was correct.
* ONE that was the rule's PROOF CASE and was not in the entry at all -- the only
  cell where gold's comment named the defect, right in 12 of 12.
* THREE whose real defect was a different slot entirely.
* ONE that was a SUSPECT cell and had never been admissible.
* Leaving the cells the rule was actually for.

Reading them narrowed the target and produced the discriminator the rule was
eventually written on. A precision figure computed over the unfiltered list was
measuring the blanks.

**NAME THE CELL AND THE SLOT, NOT THE COUNT.** A subgoal entry that names the
slot it fails and the cell it fails on cannot go stale. One that quotes a refusal
count and a precision figure always can, because it is a claim about what a
program computed and the program changes. Such figures are left standing by a
single instrument fix, and the only record of why they were suspect can be a
paragraph inside one subgoal -- which dies when that subgoal closes.

So quote a count only where the count IS the finding, and where you do, expect to
re-derive it. The readouts exist for that: `measured.py --errors ITEM ARTIFACT`
and `--refusals ITEM` regenerate per-slot figures from the artifacts on disk, at
no call cost. `goals.stale_slot_claims` (preflight step 5b) dates every slot
figure in an OPEN goal against the last change to the profile that produced it,
and a line meant as an era record is marked historical in the same vocabulary
`prose_claims` uses.

This is the same rule as §2k one level down, and the same reason: put the load on
what a program derives, because a figure typed into a sentence has nothing
checking it.

**And read gold's CHARGE, not gold's ADVICE.** A grader comment often docks for
one thing and then tells the student what a right answer would look like. Every
feature named in that second half is instruction, not a charge. Reading a
closing sentence that told the student to state something WEEKLY as a TIMING
objection invented a false negative that was not there; the charge was that the
answer did not instantiate the concept, and nothing else. When a comment both
charges and advises, the charge is the part with the points attached.

## 2j. A SWEEP DEFAULTS TO python + olx. LAUNCH BOTH UNLESS ASKED FOR ONE

**"Sweep this item" means both engines, without being asked.** They are pooled as
ONE sample of twelve runs, not compared, so a sweep of one side is not a smaller
measurement -- it is half a measurement that the ledger will then average against
six runs from a different era.

**This is a default, not a prohibition.** A one-sided sweep is a legitimate thing
to ask for -- confirming a single engine's behaviour, re-running a half that
failed, spending half the calls on a first look -- and when it is asked for, run
it. What is not legitimate is arriving at one side by omission, or reporting a
one-sided result as the item's number. If only one side was run, say which, and
say that the ledger figure still stands on the other side's older runs.

This has now gone wrong in three different ways, which is why it is a rule rather
than a habit:

* a ledger REFRESHED on one side only, leaving one item's entry half from the new
  prompt and half from the old;
* a per-side median quoted as the item's figure, landing on a value no run
  produced;
* a prompt change swept on one side while the other still served the previous
  text -- see the idmap note below, which would have manufactured exactly the
  engine difference we never reason from.

**Re-take the idmap dump after any prompt change, before the olx sweep** -- the
app serves the prompt from the dump while the harness parses the .olx directly,
so between regenerating and re-dumping the two really do send different text.
This one is ENFORCED, not advised: `agreement_app.check_idmap_is_current`
refuses to measure against a dump that predates the current prompt, and it exists
because that gap once silently re-measured a reverted change for a whole sweep.
Re-dump, confirm the new wording is present and the old wording gone, and let the
preflight confirm it.

<!-- qc:QC.2k -->
## 2k. KNOW WHICH SOURCE YOU CONSULTED, AND CHECK IT IS THE RIGHT ONE

**The question is not whether a lookup can come back empty. It is whether you
established that the thing you looked in is the thing that holds the answer.**
Empty returns are one symptom of getting that wrong; agreeing-by-accident is
another, and worse, because nothing about it looks like a failure.

A project like this keeps most of its facts in several parallel sources of the same
shape -- three gold sheets, four ledger sides, two scoring artifacts, a rubric and
the .olx generated from it and the idmap dumped from that. Every one of those is a
valid source of SOMETHING. Consult the wrong member of the family and it answers
in the right format, with plausible content, and nothing raises:

* a handout-1 gold sheet read for a handout-3 item returned `{}`, which is exactly
  what an ungraded cell returns;
* an idmap dumped before a prompt change served a complete, well-formed prompt --
  the previous one -- and a whole sweep measured a reverted rule;
* a slot profile read from one artifact shape returned `[]` for every cell of the
  other engine and reported nothing amiss.

**So the discipline is: derive the source from the question, and assert the
match.** Not "handle the empty case" -- establish, before reading, that this
sheet grades this item, that this dump serves this prompt, that this artifact was
written by this engine. Where the source can be DERIVED, derive it and never
accept it as a parameter: `gold_cell(item, pid)` computes the handout from the
item, so the wrong sheet is unreachable rather than guarded. Where it must be
passed, verify identity at the boundary and REFUSE on mismatch --
`check_idmap_is_current` and `measured.SIDE_CONTRACT` are both that pattern, and
both have caught real errors.

Then, and only then, an empty result means what it says. The raise is the
consequence of knowing the source, not the point.

<!-- qc:QC.2l -->
## 2l. VALIDATE A CANDIDATE RULE AGAINST EVERY VALID CELL BEFORE WRITING IT

**Not against the cells that motivated it, and not against the cells where gold
speaks. Against ALL of them.** A rule is a claim about every response the item
will ever see, so the cells that can refute it are mostly the ones nobody was
looking at -- the cells it currently gets RIGHT.

The pass is cheap and needs no API calls: dump every non-excluded cell of every
item the rule touches, with the response, gold's score, gold's comment, and what
the current check answers. Then read them and mark, for each, what the candidate
rule would answer. Three columns matter and only one of them is the one you were
thinking about:

  FIXES     cells the rule changes from wrong to right. The motivation.
  INERT     cells it does not change. Usually the majority, and worth counting --
            a rule that is inert on 60 of 72 cells is a narrow rule, whatever its
            prose suggests.
  BREAKS    cells it changes from RIGHT to wrong. The reason for the pass.

**A candidate rule died in the BREAKS column, on the fourth item read.** It was
a four-clause rule about when one feature of an answer contradicts another,
derived from the eight cells where gold's comment speaks to that criterion, and
it classified all eight correctly -- which is exactly why it looked finished.
Over all 72 valid cells it also:

* broke a cell where gold gives FULL credit and the current check answers `met`
  in 12 of 12. The rule read that cell as violating the criterion and would
  refuse it -- turning a perfect cell into a wrong one. Its near-twin, by
  the SAME participant on another item, is the rule's proof case. The current
  prose already tells those two apart, 12 of 12 both ways.
* risked a second cell, right in 12 of 12 today and held there by a refusal gold
  never asked for -- gold objects on an entirely different ground. Stop the
  misfire and the cell falls to whatever else refuses it, which is a gate running
  at 8 of 12. Right for the wrong reason is a category the totals cannot show you.

Both were invisible from the motivating cells, and both were found by reading
responses the subgoal had never listed.

**So: no rule is written until its BREAKS column has been read out loud.** If the
column is empty, say that it was checked and empty -- an unstated absence reads
as an unperformed check.

**And a non-empty BREAKS column is a REVISION prompt, not a scoping prompt.** The
first instinct on refutation is to retreat: keep the clauses that survived, drop
the cells they no longer reach, declare the rest out of scope. Do not stop there.
A cell that refutes a rule is the most informative cell available, because it is
the one that knows what the rule got wrong -- so before narrowing anything, ask
what single statement would account for the WHOLE distribution including the
refuters.

There that question had an answer, and it took about ten minutes. The directional
rule died on one cell against its twin -- and those two cells are the SAME
PARTICIPANT writing on two items, which is what made the comparison sharp. A
phrase naming a frequency cannot be judged until occurrences are COUNTED across
the frame; one naming only a window is judgeable on any single day. So
the discriminator was never how coarse the period is, it is whether the TRIGGER
can be evaluated inside one instance of the item's period. That version
classifies all 72 cells with no contradiction, keeps both refuters, and covers a
cell the retreat had abandoned. The retreat would have shipped a worse rule with
a documented loss attached.

Look hardest at refuters that are MINIMAL PAIRS -- same participant, same shape,
opposite gold. They isolate the variable the way nothing else in the corpus does.

If revision genuinely fails, then narrow -- and the losses go into the
pre-registration as expected, with their cell ids, BEFORE the sweep. A sweep that
loses a cell nobody predicted cannot be told apart from a sweep that went wrong.

<!-- qc:QC.2m -->
## 2m. A GATE'S REFUSAL IS INFORMATION, AND A NEW CHECK MUST BE SHOWN TO FIRE

**When a gate refuses, read it before working around it.** Not because refusals
are always right -- this guide records several that were not, and two paragraphs
below are checks whose early versions produced 13 and 72 false findings -- but
because a refusal is information either way. Either the work is wrong, or the
CHECK is, and both are worth knowing before the refusal is stepped over. What
must never happen is working around one without establishing which.

Refusals that turned out to be right, several of them more informative than the
work they interrupted:

* **leakage.py refused a rule's prose** because it borrowed two words from the
  cohort. The words were `free` and `felt` — the distinguishing vocabulary of the
  two cells the rule was written to charge. Enumerating examples of the failing
  shape had quietly copied the answers being graded. Rewriting abstractly was
  both safer and a better rule.
* **the arithmetic audit refused an `onlyif`** with `CANNOT ZERO`: the guard
  capped the slot floor so a `BLANK` deduction became unreachable. The guard went, and
  the cell it protected turned out not to need it.
* **the side contract refused three artifacts** that could not say which model
  produced them, which is why two items' ledger entries had to be re-swept rather
  than refreshed from disk.
* **`CHECK NEVER RUNS`** reported a verifier that was registered but never
  invoked — "it reads as coverage and enforces nothing".

**And refusals that turned out to be the CHECK being wrong**, which is the other
half and the reason the sentence above is not "trust the gate":

* the slot-set audit reported a cell as disagreeing with gold on a GATE that
  gold's phrase table cannot name -- a difference guaranteed before the cell was
  read (see §2k). Declaring it would have recorded an artefact of our own reader
  as a disagreement with a grader.
* `refusal_precision` scored that same slot 11 refusals, 11 CONTRADICTED, 0
  corroborated -- the worst instrument on the item, on a check that agrees with
  gold every time it fires.
* a new check's first and only finding was its own line-based parsing mistaking a
  nested `def` for a top-level one. A check whose one alarm is an artefact trains
  the reader to dismiss it.

In all three the refusal still pointed at something real; it just was not what it
said. That is why the rule is READ it, not obey it.

**A GATE'S SILENCE IS NOT A CLEARANCE, which is the converse and the easier half
to forget.** Two examples were once written into a rule that paraphrased the
very two cells the rule targets — a numeral spelled out, a preposition swapped —
and `leakage.py` passed them. They were removed on
judgement, not on the gate's verdict, and then the matcher was measured to find
out why it missed them. Four independent reasons, none of them a bug:

* `_content` keeps only `[a-z']+`, so DIGITS are discarded entirely — a corpus
  numeral and a spelled-out one can never align;
* words of three characters or fewer are dropped, which reduced one target
  response's whole phrase to TWO tokens and a single bigram;
* `MIN_EXCLUSIVE` is 2, and the measured overlap was one bigram for one pair and
  zero for the other;
* only bigrams NO OTHER STUDENT used count, and this item family's vocabulary is
  shared cohort-wide, so almost nothing on it can be exclusive to one student.

The gate is built to catch near-verbatim borrowing of DISTINCTIVE prose, and it
does. It cannot catch a paraphrase that keeps the structure and swaps the
countable words, and it is weakest precisely where the cohort's answers use the
same vocabulary — which is where a rule is most tempted to quote one. So when a
rule's prose enumerates examples of the shape it is judging, check them against
the responses by eye, and do not read a passing gate by itself as definitive proof
that there is nothing there.

**And a check is not finished until it has been seen to fail.** Two were written
here that could not have caught anything:

* `check_no_declaration_cites_a_suspect_cell` was **green by construction**: its
  item→handout map used `str(item)` where `ITEMS` holds dicts, so it keyed on dict
  reprs, matched nothing, and reported a clean corpus. A five-way fire test caught
  it.
* the fixture check needed **three wrong versions** — reading raw evidence (13
  findings on a correct tree), comparing a box against the wrong item's section
  (72 false positives), and a verbatim test that flagged a faithful hand split.

So: inject the breakage the check exists for, confirm the finding appears, restore,
confirm it clears. Add a self-test case so the retirement path is tested too. A
check nobody has watched fail is a comment.

<!-- qc:QC.2n -->
## 2n. A DECLARATION'S KEY AND ITS REASON GO STALE SEPARATELY

**Check the claim, not just the key.** A declaration names something and says why.
Checks read the name: `check_named_fixtures_still_name_something` asks whether the
item still exists, `check_course_data_reentries_are_current` asks whether the
number still matches. Nothing reads the sentence, and the sentence is where the
thinking is.

Two of the nine self-test fixture declarations were tested as CLAIMS, and both
were false while their keys were perfectly valid:

* One said its item was **the only one carrying a shape the case needs** — a cover
  group with a rule on one of its slots. No cover slot on that item carries a rule
  at all, and the case INJECTS the rule itself, so it never needed one. It was
  declared unconvertible on a reason that had never been true.
* One said it **"follows"** a paired case that picks its target by shape. It did
  not; it named the item outright. The two agreed only because the shape-pick
  happened to choose the same one. On the day that item lost the property, the two
  halves of a paired test would have tested different things and said nothing.

Both passed every check that reads them. Neither could have been caught by adding
another check that reads keys.

So when a declaration is relied on — before citing it, before deciding something
cannot be converted, before letting it silence a finding — read what it claims and
ask whether that is still so. Where the claim is about a measurable property,
measure it: five of the seven surviving reasons were confirmed that way in minutes.
Where it is not measurable, say so in the entry, so the next reader knows it rests
on inspection rather than on a check nobody wrote.

A reason nobody has re-read is an assumption with a citation.

<!-- qc:QC.3 -->
## 3. Building the model

**READ THE CREDITED ROWS, NOT JUST THE MISSES. `python3 measured.py
--criterion ITEM CHECK` prints them grouped, so this is a command rather than a
discipline.** A criterion is a line, and a line needs both sides. The cells we
MISS tell you the criterion is wrong; only the cells gold CREDITS tell you where
it should fall, and the two answers are usually different.

One slot is the case that earned the rule. Its three misses all justified the
property with something outside the category, which pointed straight at
demanding the category. That change would have cost THREE cells, each credited
on something that does not name the category either. The sixteen CREDITED rows
are what contained the actual rule -- a broader disjunction than the misses
suggested -- and narrowing to that moved the item up two points with every
guard holding.

The same reading closed another item: gold's rejections there quote their own
test, and it was the credited rows that showed two cells to be gold departing
from that test in opposite directions -- a pair no criterion can satisfy, so a
declaration rather than a rule.

Two things the command does that the eye does not. It prints OUR verdict beside
gold's, so a criterion that is right on the misses and wrong on the credits
shows up as a column of disagreements rather than a hunch. And it prints the
grader's comment, because the grouping is a heuristic on the criterion's own
words: a comment that says only 'did not use the word X' lands in the
CHARGED group while being a KEYWORD charge. A visible mis-group is harmless; an
invisible one sends the next hour in the wrong direction.

**Position and brevity beat content.** Sixteen wording variants of one matching
rule were built, measured and reverted; every one was added to the grading
guidance forty lines below the components that use the term. Two sentences
placed immediately BEFORE those components did what none of the rewrites could
— one target cell went from 11% to 78%, another from 56% to 100%.

**WORKING HYPOTHESIS: the coupling tax scales with VOLUME, not content.** That
adding prose to one slot moves gates the text never mentions has been observed
repeatedly here, and was treated as an unavoidable toll on any edit. One
measurement suggests it is a toll on SIZE. One block of about twelve lines cost
two cells a run each. Removing an unrelated slot and the twenty-line block that
existed to answer it gave both back — 2/3 to 3/3 each — and moved a third cell
1/3 to 2/3 as well. The cells that recovered were the same ones the earlier
addition had cost, and neither block mentions them or anything they turn on.

If it holds, it inverts the usual move. Every failed attempt on one family of
items added words; the change that finally recovered two cells removed them. So
before writing a new rule, ask what can come OUT — a gate a later one subsumes,
a diagnostic whose question is answered, an operand with no consumer — and
measure that removal on its own. A removal is also the cheaper experiment: it
cannot introduce a false positive, only withdraw a behaviour you already have
measured.

Stated as a hypothesis because it rests on one observation. It would be
CONFIRMED by adding and removing a block of similar size on an item with no rule
change at all, twice, and seeing the same cells move both ways. It would be
REFUTED by a large addition that costs nothing, or a removal that costs cells it
never mentions. Until then, do not spend a sweep on volume alone when a real
rule is waiting to be measured — but when a sweep is going to run anyway, prefer
the version with less text in it.

**Define a term at its first use.** If the credit components say "matches", the
definition of "matches" belongs directly above them.

**Audit for language that overrides the definition.** A categorical instruction
elsewhere silently wins, especially one that pre-emptively dismisses the
exception ("this holds however closely the wording is echoed"). Soften what is
load-bearing rather than deleting it, and make it defer explicitly.

**Be precise about relations.** "Antonym" must mean *the two ends of one
scale*, or a grader will match "happier" to a listed "mad", which is two
properties rather than two poles. Tightening that one word removed an
over-credit and moved two cells up.

**Prefer one-directional rules.** A rule that can only turn a refusal into a
match cannot disturb a box that already matched, so most cells are structurally
immune rather than merely lucky.

**Distinguish three kinds of "and then what follows" in a reference entry.**
For "X, so I Y": Y restating X, Y an INTERMEDIATE step that still leads to the
same outcome, or Y a genuine consequence. The first two are part of X. The third
is not, and should be matched against the consequence list instead. Getting this
wrong in either direction costs cells.

**Structural changes beat judgement changes.** Changes to what the grader SEES
have worked and stuck. Changes to how it JUDGES mostly have not.

**A quote is necessary and not sufficient; the equivalence rule must be CLOSED.**
One cell took five measured versions and the sequence is the lesson. Its trigger
phrase and the student's own stated target are near-paraphrases; gold
charges for it and says so outright. The slot answered the wrong way for eleven
attempts.

  v3, a flat refusal -- answer `other` unless you can quote words of theirs, "and
  answer it even when you judge the two to mean the same thing". Target 3/3,
  item 18/18. It works by forbidding the question, so it rejects genuine paraphrase
  too, and the sentence in it permitting paraphrase is dead text no cell reads.

  v4, an OPEN test fenced afterwards -- "are these the same activity, but not if
  one could happen without the other". Target 1/3. The grader QUOTED BOTH PHRASES
  CORRECTLY in all three runs and then overrode its own quote in two of them. The
  quoting step is not what forces the answer.

  v6, a CLOSED construction: equivalence is what negation and same-scale antonyms
  establish when the reversals CANCEL -- an even number, zero included. Two
  negations cancel; a negation and an antonym cancel; two antonyms cancel; an odd
  number leaves the opposite, not a paraphrase. Target 3/3 -- the first version to
  hold the cell while admitting paraphrase. But hoisted to the front of the prompt
  it reached criteria it should not govern and cost three cells: a student's
  frequency phrase stopped matching the activity they had chosen, and it
  swallowed the pointer rule whole.

  v7, the same with two carve-outs -- degree and detail are not differences of
  activity, and a pointer with no content of its own is not compared by this test
  at all. 18/18, no cell changed against v3, target 3/3.

So: define equivalence through a construction with a FIXED number of admissible
moves, never as "means the same thing" with exceptions bolted on. Then say what
the test does NOT govern, because a definition placed early enough to work is
also placed early enough to capture rules that were doing their own job.

**Placement cuts both ways.** Section 3 has long said position beats content.
The cost side: a shared definition is emitted immediately before the components
that use the term, and moving an equivalence rule there from a slot note is what
let it override the pointer rule. Early placement raises a rule to govern
everything after it, which is the point and also the risk.

**A verdict now REQUIRES probe evidence, in code.** `compare_runs` has always
printed PROBE REQUIRED and exited 2 on a moved cell, and that was not enough: a
1-cell median move across three items was read as a loss and reverted without a
probe, because the tool printed a warning while the READER drew the conclusion.
Reverting felt like the cautious option rather than a conclusion needing support.

So the conclusion is now the tool's. `compare_runs` ends with a VERDICT line,
withheld unless every moved cell has a >=6-run probe of THAT EXACT PROMPT SHA on
file in `PROBED.json` -- a probe of a different prompt proves nothing about this
one. The withheld banner says KEEP AND REVERT ARE BOTH UNSUPPORTED, because the
failure was not choosing wrongly between them but believing one of them was the
safe default. File a probe with `compare_runs.py --record-probe ITEM
OUT/<probe>/ITEM.runs.json`; `measured.py --preflight` lists unprobed movers as
step 7, beside unread fixtures and unreconciled gold.

What it caught immediately: of eight moved cells across three items, most came
back inside the noise band, one improved, and the only genuinely unstable one
had measured unstable under the PREVIOUS configuration too. Two apparent
"regressions" were stable on probing. Nothing had actually regressed.

**State a matching rule ONCE.** `olx_prompts.EQUIVALENCE_DEF` is now shared: one
item asking whether a box matches a listed entry and another asking whether a
trigger names the activity the student chose are one operation. Two definitions
of it drift. Not every item is migrated onto it -- that changes a measured prompt
and needs its own sweep.

**Editing a long slot note has non-local effects.** Clauses with airtight
logical scope moved cells whose preconditions they could not satisfy. An
incumbent wording is worth something purely for carrying no edit risk.

**Match the schema.** An instruction naming a value the enum rejects is dead
text — and worse, it is dead text on the channel you are trying to influence.

---

<!-- qc:QC.4 -->
## 4. Correcting gold

The bar is a **fact established in the submission**, not a difference of
judgement. Four caveat kinds already exist for the rest: declare a deliberate
disagreement, a criterion gold decides inconsistently, a criterion neither side
scores, or drop the cell.

**Does not qualify:** a rubric-design opinion. Gold applies
**no-double-jeopardy** — it charges a naming miss once and does not re-charge
the effect — which looks like crediting an effect on something it says was
never named. Verified across all twenty rows: every effect slot gold withholds
is one whose box describes no effect. "We would charge this differently" is a
divergence, not a correction.

**Gold's ordinals are tallies, not indices.** "Second X" means "the second one
you named", not "box 2". One cell needs opposite index readings for
its two families to make gold true; as tallies both are ordinary. Compare
per-family COUNTS, which is also what a cover group scores. Box-level
attribution invents disagreements gold never asserted — it manufactured four
across two cells that in fact agreed.

**An entry reasoning from box contents inherits every judgement in the split.**
One correction raised a row by reasoning from a clause that occupied two boxes;
repair the fixture and gold's original number was right. Check the spans first.

**Quote the row you are correcting.** One rationale cited a different student's
answer as its evidence. The conclusion survived; the entry was unverifiable.

**Assert the old value against the sheet on every run**, so a correction cannot
outlive the row it corrects.

---

<!-- qc:QC.read-the-declaration-tables -->
### Read the declaration tables BEFORE writing a correction

**A cell cannot be both corrected and declared.** `CORRECTED_GOLD` says gold's
number was wrong against the dictionary or the graders' own practice;
`GOLD_DIVERGENCES` says gold's number STANDS, that it is coherent, and that we
knowingly differ. Booking a cell in both counts one finding twice.

Three of five corrections written in one session landed on cells already
declared, one of them in two entries at once. Each correction was built from
comparator evidence by someone who did not read the declaration tables first —
and one of those tables is *named* for the very finding a correction wrote up at
length as new.

**Nothing caught it for a day, and the reason generalises.** Every other
declaration check compares a table against RECORDED data, so while the ledger held
pre-correction numbers, "we knowingly miss this cell" stayed true of what was
recorded. The contradiction surfaced only on re-recording.
`enforcement.check_no_cell_is_both_corrected_and_declared` is table against table
and needs no run data, so it fires the moment the second entry is written.

## 5. Reducing exclusions

<!-- qc:QC.nothing-can-host-this -->
### "Nothing can host this" does not mean "this cannot move"

**An audit finding names what is missing, not what is impossible. Before writing
"cannot" into a subgoal, test the capability separately from the plumbing.**

This is the most repeated error in these records, and it always looks
like a finished piece of reasoning:

* `forbid` and `maps` broke seven items, and the note read "the app cannot score
  these". The app was fine; one zod schema did not DECLARE two attributes.
* A slot was to be converted to `derived`, and the note read "score.py cannot
  compute that match". It never reads `item["derived"]` — but `derive_ledger`
  takes the response text and already inspects it. A missing dispatch, not a
  missing capability.
* Another was recorded as unmigratable because "no credit component exists to
  carry a `rule`". True, and irrelevant: `CLI_CRITERIA_NOTES` plus a criterion
  renderer already carries two other notes to the paper scorer by a different
  route.

Each time the evidence for the strong claim was an ABSENCE — a grep that found
nothing, a field that was not there — and an absence is the weakest evidence
there is. It is equally consistent with "impossible", "not built yet" and
"built somewhere I did not look".

So when an audit says a rule has nowhere to go:

1. **Ask what the other side actually receives**, not what mechanism delivers
   it. Build both prompts and diff them. `score.py` uses `rule or desc` and never
   reads SLOT_NOTES — that fact is worth more than any inference about it.
2. **Look for a second route.** This codebase has at least three ways text
   reaches the paper scorer: a component `rule`, the shared `_criteria_section`,
   and a criterion renderer reading a note directly.
3. **Then price it.** The honest answer is usually not "impossible" but "this
   costs a prompt change on a measured item". That is a schedule, not a wall —
   and saying so lets someone decide, where "cannot" ends the conversation.

Write the price into the subgoal. "Migratable, costs a re-measurement of one
item" is a decision someone can take; "blocked" is one they cannot.

<!-- qc:QC.the-rule-every-declaration -->
### The rule every declaration has to satisfy

**A declaration that asserts something mechanically checkable must carry that
assertion as DATA, not only as prose, and some check must re-test it.**

A declaration is a claim that something is true and will stay true. The second
half is the part that rots. Nothing about a stale declaration looks wrong: the
cell has stopped erroring, or the arithmetic has been fixed underneath it, so
there is no error to notice and the audit stays green. It simply goes on
subtracting itself from every rate, or — worse — reads to the next person as a
standing reason not to fix something that is already fixed.

Two of those surfaced in one day, which is what prompted writing this down:

* `SCORING_DIVERGENCES` declared that an item's assignable slot points fell
  short of its max for hours after a `max=` edit made it false. Its own
  `enforcement` field said `"none"`, so no check owned it and nothing reported
  that none did.
* Outside the audit entirely, a shell mitigation armed against the `forbid`
  defect went on killing four sweep items for an hour after the defect was
  fixed. The audit could not have caught that one — but it is the same shape,
  and it is why the rule is stated as a principle rather than as a patch.

So, concretely, when you write a declaration:

1. **If it names a number, put the number in a field.** An exclusion whose
   reason cites a point figure must declare `expect_error`; `check_exclusion_
   claims_are_data` enforces it. One exclusion read "the error here is exactly
   -2.50" through every run that measured -1.25.
2. **If it asserts a structural fact** — a max, a slot sum, which side computes
   what — say it in a form the audit can recompute. Prose may explain the
   number; it may not be the only place the number lives.
3. **Register the table.** `enforcement.DECLARATION_TABLES` maps every
   declaration table to the check(s) that re-test it, and
   `check_every_declaration_table_has_a_verifier` fails the audit when a table
   has no verifier, names a verifier that no longer exists, or is not registered
   at all. Coverage is the property being enforced — a table nobody watches is
   invisible in exactly the way a wrong declaration is not.

That last check found three tables on the day it was written —
`CONSENSUS_OVERLAP_BACKLOG`, `COUNTABLE_EXEMPT`, `MULTI_BLOCK_DECLARED` — that
were being enforced but not registered. All three had a verifier; none of them
said so, and nothing could tell the difference between that and having none.


A caveat is a promise to stop looking, and they accumulate. Each one is
defensible at the moment it is written, and nothing afterwards asks it to
justify itself again. Left to grow, the headline rate stops measuring how well
the model scores and starts measuring how much has been excused.

**They do not all cost the same, and only two of the five move the number.**

| Caveat | What it does to the rate |
| --- | --- |
| `PER_ITEM_EXCLUDE` | **drops the cell from every rate** — the most flattering thing you can write |
| `CORRECTED_GOLD` | **moves the target** the cell is measured against |
| `GOLD_DIVERGENCES` | nothing. "A divergence is still scored; we just knowingly disagree." |
| `GOLD_CEILINGS` | nothing. Prose whose only job is to stop a ceiling reading as headroom. |
| `agreement.UNSCORED_GOLD_CRITERIA` | nothing head-to-head; the omission is symmetric by construction. |

The two rules below therefore bite on the first two. The safe landing place for
a real disagreement is one of the last three, which leaves the miss **counted
and visible** while still saying what it is.

**NEVER DECLARE A GOLD DIVERGENCE UNTIL EVERY ALTERNATIVE IS EXHAUSTED — and
the first alternative to check is the FIXTURE and its alignment with gold.** A
divergence says "we understand this cell and choose to disagree", which is the
most flattering thing that can be said about a miss short of dropping it: it
closes the question, reads as understanding, and costs nothing to write. It is
also the easiest thing to be wrong about, because a cell can look like a
principled disagreement for any number of duller reasons:

- the fixture hands the grader the wrong text, or splits it at the wrong
  boundary, so the two sides are not judging the same answer at all;
- the box the rule reads is empty, or holds a neighbour's words;
- gold's row does not reconcile with its own comment, making it a wrong NUMBER
  rather than a different judgement — three cells were found this way, and two of
  them had been declared or ceilinged first;
- the criterion is unreachable as written — a verdict token the slot does not
  offer, a rule parked where only one generator reads it;
- the item's own scoring layer makes the rule inert, which no amount of prose
  about it will fix.

So the order is: read the fixture out box by box **and in full — every line of
every response, see section 1** — check gold's arithmetic against its own
comment, confirm the rule reaches both generators and the layer that decides the
score, and only then — with the attempts and their numbers written down — ask
whether what remains is a genuine disagreement.

The in-full requirement earns its capitals here specifically. A truncated
readout does not merely fail to find the answer; it manufactures an argument FOR
declaring. A divergence was defended on the strength of a neighbouring cell that
appeared to lack the required feature, read from its first line alone — and that
cell's second sentence supplies it plainly. Read whole, the item's cells
separated perfectly and the rule was obvious. A declaration argued from partial
text is the worst outcome this section exists to prevent, because it is
indistinguishable, afterwards, from a declaration that was earned.

The cost of skipping this is not hypothetical. One participant's cells on two
items were carried through four measured attempts and 0 of 36 passes, and looked
exactly like a divergence. What the reading actually produced was better: gold's
rows did not reconcile and became CORRECTED_GOLD, the criterion turned out to be
present but unreachable on one layer, and two item types were found not to carry
the slot at all — which dissolved an apparent gold inconsistency that a
divergence would have enshrined as ours.

**An exclusion on a cell the scorer gets WRONG must be removed.** That is
exactly the exclusion buying accuracy nobody earned, and it is the one that
will never remove itself, because the cell it hides is the cell that would
otherwise ask for work. There are two honest ways out and neither keeps the
exclusion: if the miss is ours, take it and let it show; if it is gold's, name
it — a correction, a divergence, a ceiling — so the cell counts again. One cell
was `PER_ITEM_EXCLUDE` with an `expect_error` and became a `CORRECTED_GOLD`
entry, because the exclusion "dropped a perfectly scoreable cell from every rate
in order to absorb an error that was gold's". Its measured behaviour did not
change at all; the rate went up because a cell we score correctly finally
counted.

**Declaring beats excluding wherever the choice exists, because an exclusion
silences questions nobody asked it to.** A cell marked `unscoreable` is skipped
by `check_consensus_spans_are_disjoint` — so an overlap between two of its spans
sat exempt for as long as the exclusion stood, never judged by anyone.
Removing the exclusion surfaced it the same minute, and it turned out to be
faithful and declarable. An exclusion is written about the SCORE; it silences
every other question about the cell.

**An exclusion on a cell the scorer gets RIGHT must be retested until it is
removed.** It is not doing the job it was opened for, so what remains is the
claim, and the claim is now false in a way that misleads in the expensive
direction: a stale ceiling reports unwinnable ground where there is none, and
hides real headroom behind it. A cell left `GOLD_CEILINGS` for precisely that
reason once `scores_as_exact` credited its off-grid gold — "a note here would
tell a reader there is unwinnable ground where there is none."

**The retest trigger is a change, not a calendar.** In practice an exclusion is
retired by work done for some other reason, so retest every excluded cell that
a prompt or fixture change could plausibly reach, and sweep the whole set when
an item closes out. One ceiling was retired by a definition written for the item
as a whole: the cell went from 56% at nine passes to 9 of 9, and
"it was never an unwinnable criterion; it was an undefined term."

**Retesting is already free — the machinery exists, so use it.** Excluded cells
are still run and still scored; `cell_exclusions` says so in terms — "Not a
work list. Excluded cells are still RUN and still scored... Only the RATE
excludes them." On top of that, an `unscoreable` entry may declare
`expect_error`, the size of the miss it claims to absorb, and `stale_claim`
then asserts it on every run and prints `<-- CLAIM STALE` when the cell stops
behaving as documented. That is the retest, automatic and per-run. **It only
fires where the number is declared: 1 of the 5 live entries declares
`expect_error`, so the other four are retested only when a person remembers
to.** Declaring it on every one of them is the cheapest way to make this
section self-enforcing.

**The commonest bad reason to open one is instability.** A cell that flips
between two scores on identical input looks like a criterion that cannot be
scored, and "cannot be scored consistently" is the more flattering of the two
explanations, because it puts the fault in gold. Three cells once explained
that way were fixtures cut in the wrong place, and a fourth was a term the
prompt had never defined. An instability is evidence that the grader was given
no rule, not evidence that no rule exists.

---

<!-- qc:QC.every-declaration-table-needs -->
### Every declaration table needs a RATCHET, or its entries outlive their reason

**A stale declaration is worse than none: it silently claims the audit checked
something it did not, and it subtracts itself from every rate with no trace.**

`GOLD_SLOT_DISAGREEMENTS_KNOWN` had a ratchet — an entry whose cell stops
disagreeing is reported, and the table's size may only fall.
`GOLD_SLOT_BOUNDS_KNOWN` had none, and it showed: three entries on one item stood
asserting "gold charges one slot of the group; we charge none" on the very day
the rule made us charge the box gold NAMED in 12 of 12 runs, and two of them said
only "same as the first" so the stale claim propagated by cross-reference. Adding
the ratchet retired those three and then found **two more that had been stale for
longer** — cells where a subgoal's own text already recorded agreement while this
table was never updated to match. Table 8 → 3, budget 8 → 3.

The same thing happened again the same day with a brand-new table:
`PROBE_REACH_LIMITS` was created, registered, and its verifier found on its FIRST
run that the entry it inherited listed four items where only one qualified — the
other three were excused for nothing.

So when adding a declaration table:

1. Write the verifier with it, and prefer one that tests the entry's **structural
   precondition** over one that needs run data — it fires sooner and cannot recurse
   into the audit that calls it.
2. Give it a **budget that may only fall**, like `GOLD_SLOT_BOUNDS_BUDGET`.
3. Register it in `enforcement.DECLARATION_TABLES` naming the check that re-tests
   it. An unregistered table is reported, and so is a check that is **defined but
   never invoked** — both guards fired during this work.

<!-- qc:QC.6 -->
## 6. What wastes time

- Tuning a rule while the fixture is wrong.
- Ranking variants inside the noise floor. Six variants, all intervals
overlapping, read as a progression.
- Treating a plausible reading of the text as a demonstrated cause. One cell's
miss was attributed twice to a rule whose removal left it unchanged. A correct
reading of the text is not a cause.
- Bundling several changes and reading the net result. You learn that the bundle
is bad.
- Fixing in the prompt what is broken in the harness.
- Running an experiment whose predicted outcome is failure without saying so
first.
- **Concluding a distinction is unstatable after testing only SINGLE features.**
Twice on one item. A cell's two boxes matched on every individual predicate —
payload type, causal link, direction, subject — and I reported that no clause
could separate them. A CONJUNCTION of two of those features did, and the item
gained a cell. Then one cell against another was called "a boundary at the noise
floor" and stopping was
recommended; the per-ground data showed one of the two was answered correctly
12 times out of 12 when asked on its own. **Before writing "no rule can express
this", test at least one conjunction and one contrast framing, and read the
per-ground rates.**
- **Reverting a change on the item total.** The three-way split was reverted as a
failure. Its real defect was one ground's wording, which the per-ground data named
and the total could not. Re-running the same split with that ground repaired gave
the best result the item has had.
- **Refreshing a ledger on one side only.** Re-recording an item's olx half while
its python artifact was refused manufactured a path asymmetry the audit immediately
reported as a declaration true on one path and false on the other. A uniformly
stale ledger is better than a half-refreshed one; roll back and re-sweep both.
- **Naming a finding for what it looks like rather than what it is.**
`CHARGE-ONCE OLX ONLY` described an audit-coverage gap and read as an engine
divergence. It was filed among genuine scoring divergences, and the label was
believed — by its own author, twice in a day, once at the cost of an hour spent
disproving a divergence that was never claimed.

---

## 6a. Trusting an instrument

### A test that cannot fail reads exactly like a test that keeps passing

**`check_maps_tables_are_attached` was a tautology for two stages and nobody
could tell** — the check has since been RETIRED, with a declaration recording
why, so this is a lesson about how it failed and not a claim about anything
still running. A refactor made the table it compared a DERIVATION of the thing
it compared against, so the two could never disagree. Its findings were zero, its
audit line looked like every other clean line, and the only thing that knew was
its selftest case: the injection was installed and NOTHING FIRED.

When a check goes quiet, ask whether it still CAN speak. The audit cannot answer
that about itself — a green line means "found nothing", and "found nothing" and
"stopped looking" are the same line.

Writing the missing cases made the point twice over. Twenty-eight rubric-reading
checks had none; of the injections written for them, THIRTEEN did not fire on
the first attempt, and every failure was silent — installed cleanly, changed
nothing, and would have joined the suite as proof of something it never tested.
The causes were all small and all specific: a bare word where the check matches
backticks, a key typed as a string where the table uses ints, a participant
outside the range the readout prints, both branches of a two-branch test forced
the harmless way. **Count the injections that FIRE, never the ones written.**

### A verifier must not share the scrubber's rule

A substitution matched file text with words joined by `\s+`. The scan that
verified it used the same pattern. They agreed with each other and both missed
137 student sentences — written across adjacent string literals, where the file
holds a quote, a newline, indentation and another quote between two words, and
Python joins them only at import. (That count is the one this episode found. The
history has since been rewritten against the whole response space and measures
**27** distinctive student 4-grams, with a positive control of **2107** on the
original — the lesson is the shared blind spot, not the number.)

"0 found across 1640 blobs" was never evidence the history was clean. It was
evidence that two copies of one assumption agreed. Where the thing being checked
is Python, read it the way Python does: parse it, and look at the string
constants the parser has already joined.

### A count that holds steady can be hiding a swap

The audit's raw finding set was 32 before a deletion and 32 after, which reads
as "unchanged". It was four findings leaving as four arrived, and the departures
only became visible once the arrivals were fixed.

Compare the SET across any step that can both add and remove — and a step that
deletes a source does both at once, which is when the count is least
informative. Record the set beside the number: a baseline you cannot reproduce
is not a baseline, only a memory of one.

## 6b. A CHECK THAT COMPARES BYTES CANNOT TELL YOU THE THING RUNS

Stage 08 acceptance had four instruments and all four passed: frozen prompt
oracles, `fingerprint_text`, the served `idmap` prompt, the corpus replay. Every
one of them compares bytes against a frozen copy. That is exactly the right way
to prove a migration changed nothing — and it is no evidence at all that the
result works, because **a handout that renders nothing has the same bytes as one
that renders.**

The gap is not theoretical. The first end-to-end simulation ran on port 8899 and
reported 26 items scored, 0 failed, every diff +0.00. It was a scorer-side run:
it reads the `.olx` and calls the grader directly. The UI on that port could not
boot at all — the engine's port map in lo-blocks
(`packages/shared/lib/state/store.ts`) throws on an unlisted port — so the same green run
would have been produced by a release whose every page was the words "Failed to
start."

**So ask of each instrument: what would it say if the thing were broken?** If
the answer is "the same as now", it is a neutrality check, not an acceptance
check, and it needs a partner that actually runs the thing. Two now do: one
simulated student through every item on the scorer side, and one clicking
through the course and all three handouts in a browser — answering every
question, pressing every feedback button, advancing to the end of each handout.

Two corollaries, both paid for:

* **Absence is not a pass.** Both rows report NOT RUN when their artefact is
  missing, in the same idiom the corpus-replay row already used. A check that
  quietly returns success when its input vanished is the C1 failure mode.
* **A green run on a configuration that cannot exercise the claim is not
  evidence about the claim.** Record which half was exercised.

<!-- qc:QC.6c -->
## 6c. A SCAN CAN ONLY FIND WHAT ITS REFERENCE SET CONTAINS

**The reference set was the defect.** The substitution table was seeded from the
quotes our own prose had CITED. Both leak scans then matched against that same
table. So "no student text remains" could only ever mean *"the sentences we
already knew about are gone"* — a true statement that answers a different
question. `corpus_refs.json` is the same trap in data form: it holds the **715
cited spans (40,766 chars)**, while the response space is `corpus_ref._index()`
— **1023 boxes, 118,804 chars**.

**Three rules, each of which would have caught it.**

* **Name the reference set out loud.** "No student text" is not a finding;
  "no match against the 1023 boxes of `_index()`" is. If the scope cannot be
  stated, the claim cannot be checked.
* **Run the positive control.** Scan a corpus you KNOW is dirty — here the
  original history, which returns 3123 — before believing a zero. An untested
  scanner returns zero for two reasons and they look identical. This is the C1
  failure mode with a different mask.
* **Ask which direction the search runs.** "Find our quotes and remove them"
  bounds the result by what we already recorded. "Find everything a student
  wrote and remove it" bounds it by the data. Only the second can be complete.

**Four words is the working threshold** — the point at which copying from a
unique source is reliably detectable — not eight. At n=8 the same history showed
312 rather than 915, which understates it by two thirds.

**But judge a four-gram by its CONTENT WORDS.** An exact four-word sequence
carrying two function words and two content words is still likely unique to one
author: the improbability is in the exact sequence, so the function words are
part of the evidence and must stay in the match. Judged after stripping them,
the same run is two content words, which matches text nobody quoted. So keep
them in the comparison and require **≥2 content words** to call a run a
quotation (`content_words.py`). Measured both ways on the same history: 915 raw
4-gram hits, **653 distinctive**; on the original control, 3123 raw and **2151
distinctive**. About 30% of the raw signal is function-word noise — enough to
argue a real residue away with, in either direction.

A later correction, from the same rule: **a numeral is not a content word.**
Where an assignment asks for a series of counts, student fields hold bare runs of
digits, and those match ordinary code — a ten-character span of one student's
data can be substituted into an initialiser and break a module. Digits still take
part in the MATCH; they cannot be what makes a run distinctive.

The rule must govern the SCRUBBER and the SCAN alike. Two components disagreeing
about what counts as a quotation is the same failure as two instruments sharing
one blind spot, and it is how this was missed the first time.

## 6d. QUOTING A STUDENT IN AN `.olx` — THE PROCEDURE, AND WHY THE ANSWER IS USUALLY NO

The handouts are served to students and this repository is public, so a
student's sentence in an `.olx` is a disclosure. The corpus-reference mechanism
exists so the FILE can hold a citation while the PAGE shows the words. It works,
and it is still the second-best answer.

<!-- qc:QC.first-can-the-example -->
### First: can the example be invented instead?

**Usually yes, and that is the fix.** A handout taught a definitional point, and
its worked NON-example was a real student's sentence, carried in by reference.
The reference kept the words out of the file and still made a student's writing
the thing every reader is taught from — and made the page unrenderable without
the corpus. It was replaced with an invented
sentence carrying the same defect, and the reference went away entirely.

**And the quote came from a question in that same handout.** It was one
participant's answer to an item whose own box sits twenty-five lines BELOW the
instructions that quoted it. So every later student met a classmate's answer to
the question they were about to answer, on the page where they answered it. That is worse than a disclosure in two ways:
it is the tightest re-identification context available, and it contaminates the
instrument, because answers written after that text went in are not independent
of it.

**So check the provenance, not just the words.** Before quoting, ask which
question the sentence answered and whether the reader is about to answer it.
A replacement must clear the same bar: the invented sentence that replaced this
one draws on a different domain from the box it precedes — it does not pattern
the answer to its own question.

**Check an invented replacement for collisions before using it.** A sentence you
made up can coincide with one a student wrote. Scan the candidate against the
whole response space with course text subtracted
(`scripts/history_rewrite/scan_full_corpus.py`); three candidates were checked
and all three came back clean, which is what licensed picking one. A
near-paraphrase of the original is NOT a replacement — it still derives from
that student's writing.

### If a real quotation is genuinely required

1. **Build the reference with `corpus_ref.make_ref`. Never format one by hand.**
   Every harness that hand-formatted one eventually formatted a bad one —
   `None:None` spans that parse, look like citations, and resolve to nothing.
2. **Declare where the spans live**, in the file's frontmatter:
   `corpus_data: $COURSE_DATA/corpus_refs.json`. Without it the build refuses
   rather than render an unresolved reference.
3. **Export the spans**: `python3 scoring/corpus_ref.py --export-olx-data <path>`.
   The export holds only the spans actually cited.
4. **Lower the budget afterwards.** `OLX_CORPUS_REF_BUDGET` in `enforcement.py`
   ratchets DOWN and never up, so the count you leave becomes the new ceiling.

### What the mechanism costs, stated plainly

* **The page cannot render without the corpus.** The lo-blocks resolver
  (`packages/shared/scripts/resolveCorpusRefs.ts`) throws when the variable named
  in the frontmatter is unset — and it throws whenever the DECLARATION is
  present, references or not. So when the last reference in a file goes, **remove
  the frontmatter too**, or the dependency outlives the thing it existed for.
* **References interact with attribute grammars.** A reference is colon-heavy,
  and the slot-sheet attribute is `name:description:verdicts@weight` split on
  colons — so a reference in a slot description silently shifted the verdict list
  to the cell id. Both parsers now protect a reference's colons, and
  `check_slot_grammars.py` refuses a divergence between them. Any NEW
  colon-delimited or pipe-delimited attribute must be checked the same way.
* **Two resolvers must agree.** Python resolves when the scorer reads the file;
  the engine resolves when the page is built. `check_ref_grammars.py` is what
  stops them drifting.

### The rule in one line

**A reference is for text that must be exact and is somebody else's. Everything
else should be invented — and an invented example is checked against the corpus
before it is trusted.**

## 7. When to stop

Stop when what remains is **declared**. For the item this guide came from:
seven slot disagreements, six of them a deliberate divergence, a gold ceiling,
or a corrected row — and the seventh explained. That is a finished first model.

Do not stop because a rule failed. Sixteen failures on one channel turned out
to be sixteen instances of one mistake about where the text went.

<!-- qc:QC.and-do-not-stop -->
### And do not stop on a median

An item was proposed for closure at "20 of 20" while its mean was 18.8, six of twelve
runs scored 18, and the two cells that decided the boundary sat at 7 of 12 in
OPPOSITE directions. That is not a finished item; it is a coin flip rounded up.
Three attempts later the same item closed at **median 20, mean 19.7, range 19–20,
four wrong cell-runs in 240** — and the case for closing was that the median, the
mean and the range finally agreed, not that the headline had not moved.

The closing question is therefore not "is the median at ceiling" but:

1. Do the **range, median and mean** agree?
2. Is every unstable cell either **near-unanimous** or **owned by a subgoal**?
3. Does every remaining wrong cell have an **owner or a declaration**, so closing
   orphans nothing? A cell was reassigned to another subgoal before its own
   closed, for exactly this reason.
4. Are the per-check accuracies claimed only where **gold determines them**, with
   the rest reported INDETERMINATE?
