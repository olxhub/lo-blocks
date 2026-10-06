# OLX ↔ python equivalence: state, and what is left to do

## Why this file exists

`agreement_app.py` measures the lo-blocks olx prompts against the same gold rows
`baseline.py` uses, so the two implementations can be compared. That comparison
is only meaningful if both run the **same rubric**.

Run `python3 equivalence.py` for the current table, `--item Q4a` for one item's
gaps, `--python Q4a` to print exactly what the paper scorer sends.

### Three scorers, and what "python" means here

The project grew a third scorer after this file was named, and the word "python"
now carries two senses. Which one is meant is stated at each use from here on;
where an older passage says "python" without qualification it means the **paper**
scorer, because that is the only one that existed when it was written.

| name used here | code | prompt | output |
| --- | --- | --- | --- |
| **paper** (older passages: "python") | `score.py`, measured by `baseline.py` | its own, from `rubric_hN.py` | credit_checks + deductions + advisory_note + safety_flag + escalate |
| **python harness** | `agreement.py`, driven by `sweep_cli.sh` | the SHIPPED `.olx` prompt | a slot sheet — `{checks, feedback}` |
| **olx** | the app itself, driven by `agreement_app.py` | the SHIPPED `.olx` prompt | a slot sheet — `{checks, feedback}` |

The distinction matters for reading the rule table below: its left column is the
**paper** scorer's fields. `agreement.py` has no `escalate`, no `safety_flag`
and no `advisory_note` — it sends the olx's prompt and returns the olx's sheet,
so on every row of that table it belongs in the RIGHT column, not the left.

## State: structurally equivalent as of 2026-08-02

All 23 olx prompt bodies are now **generated** from `rubric_hN.py` by
`olx_prompts.py`, following `score.py:build_prompt`'s skeleton — item header,
question as asked, credit components with points, deduction code table, all
guidance bullets, exemplars, cross-item context — copied verbatim.

    python3 olx_prompts.py --check     # do the .olx files match the rubric?
    python3 olx_prompts.py --write     # regenerate them
    python3 olx_prompts.py --print Q6  # one prompt, as sent
    python3 olx_prompts.py --refs      # <Ref> ids dropped/added/duplicated

`equivalence.py` reports **0 undeclared gaps** and 3 declared omissions (all on
1c, all describing `.docx` evidence that has no olx analogue). Measured baseline
of the equivalent system: **410 cells, 85% exact, MAE 0.33** — see Measurement
state.

> **2026-08-12 — that baseline predates deviation 7.** Per-check notes were added
> to the 20 items whose checklist is shown, which lengthens the completion
> without changing any verdict. `equivalence.py` is unmoved (it compares scoring
> behaviour), and `--check` still passes, so the structural claim above holds.
> The **measured** figure does not carry across it: re-run `agreement_app.py`
> before quoting 85% for the current system.

Before this, across 23 items: the question text appeared verbatim in 1, credit
descriptions in 1, deduction texts 0–6 of each set, guidance bullets 0–8 of each
set.

**Do not hand-edit a prompt body in the .olx.** Change `rubric_hN.py`, or change
`olx_prompts.py`, and re-run `--write`. `--check` fails if someone has, and each
handout's header comment says so.

## Deviations

Every difference between what `build_prompt` sends and what the .olx sends is
listed here. Three were forced by the structural difference between the systems;
the rest are consequences of those three. Adding a difference means adding it
here and to `olx_prompts.py`.

### 1. The student response arrives per-field

The olx has structured input, one box per judgement; the python parses one prose
block. `olx_prompts.RESPONSE` maps the boxes; `## Student response to grade`
lists them under their on-screen labels. Fixtures for measurement come from
`out/hN/participant_NNN.json` — see "Fixtures" below.

### 2. The system prompt is inlined

`LLMAction` has no system-message channel, so `SYSTEM_TMPL` heads the user
prompt as `olx_prompts.WEB_SYSTEM`. Rules 3 and 5 are verbatim and
`_check_rules_still_match()` asserts it; the other six are re-pointed at fields
that exist here, because of deviation 3:

| rule | paper (`score.py`) | olx |
| --- | --- | --- |
| 1 | credit component by component, quote into `evidence` | check by check, quote into that check's `evidence` |
| 2 | emit a deduction ledger using exact codes | the deduction table is canonical *wording* for `feedback`; the code is an internal label |
| 3 | do not output a score | verbatim |
| 4 | deductions consistent with unmet components | `feedback` consistent with `checks` |
| 5 | generously but not charitably | verbatim |
| 6 | empty response → every component unmet + the "did not answer" code | empty response → every check unsatisfied, said plainly |
| 7 | `safety_flag` | a safety note in `feedback`, never a fault, never changes a verdict |
| 8 | `escalate` | say it in `feedback`; set the `confident` check where the sheet has one — note the INVERTED sense: `absent` is the flag |
| 9 | `advisory_note` | say it in `feedback`. Folded into the student's feedback by `compose_feedback` when there is other content or a safety flag, so it is prose on both sides — it just travels as its own field on the paper side |

Rules 8 and 9 are what let every guidance bullet stay verbatim even where it
says "put that in `advisory_note`" or "set escalate" — the prompt explains the
substitution once instead of the bullets being edited. `advisory_note` had no
row of its own until it was audited for: it was named only in this paragraph,
which left its mapping implied rather than declared, unlike `safety_flag` and
`escalate` beside it.

### 3. Output is a slot sheet

The olx grader (`SlotSheetGrader` over `scoreSlotSheet`) consumes
`{checks, feedback}`; the PAPER scorer returns credit_checks + deductions +
advisory_note + safety_flag + escalate. `agreement.py` returns the
same `{checks, feedback}` the olx does — it is the shipped prompt run from the
command line, not a second rubric. The sheet is authored in
the `slots=` attribute and `olx_prompts.py` **reads it** to generate the
`## The checklist to return` section, so the prompt and the schema cannot drift.

The slot keys already match the rubric's credit `what` names on every item
except the operant-conditioning ones, where the olx sheet is shaped differently
(`names_behavior` for `behavior`, a `cadence_is_daily` gate rather than a
`cadence_ok` boolean). `olx_prompts.SLOT_NOTES` maps each olx check back to its
numbered paper criterion, so the criteria text stays verbatim and still names
real checks.

**The type judgement is a classification, not a verdict.** This is the largest
of those shape differences and the newest, so it is spelled out. The paper
scorer asks WHICH of the four types something is as a verdict value; the olx
splits that in two — the model answers `refers_to` from a named set, and the
grader COMPUTES whether that answer is the right one. Ten items are shaped this
way, not the eight the previous wording implied: D1 and D2 classify as well.

| items | picks | the computed check |
| --- | --- | --- |
| PR, NR, PP, NP | `observed_type` from `operant_or_none` (PR/NR/PP/NP/none) | `demonstrates_type` @2, by `expect="demonstrates_type:observed_type=PR"` — the item names its own answer |
| DAY1, WK1, DAY2, WK2 | `observed_type` from `operant_or_none`, `named_type` from `operant_or_unclear` | `matches_chosen_type`, by `equals` — the two classifications must agree |
| D1, D2 | `defines_type` and `named_type`, both from `operant_or_unclear` | `matches_chosen_type`, by `equals` |

Three consequences worth holding on to. A `pick` slot answers `refers_to` ONLY —
no `verdict` is asked of it, because "which one is it" is not a judgement about
quality. The computed check is removed from the response schema entirely, so the
model is never asked for an answer the grader will overwrite. And because
`expect` names the expected value out loud, the correct answer is no longer
carried by the ORDER of a verdict list — which is what made the older
`PR`/`NR`/`PP`/`NP`-as-verdicts shape fragile, since first-in-the-list silently
meant "correct".

Consequences of this deviation:

* **The deduction table is sent to every item**, including `derive_from_credit`
  and `derive_from_criteria` items where `build_prompt` omits it. The python
  applies that canonical wording *after* the call, in
  `score.py:compose_feedback` (the paper scorer); the olx has no post-processing step, so the model
  must see the wording to be able to use it.
* **`build_prompt`'s "## Slots to judge" block is not reused.** Its verdict
  paragraph is written for Q6 and describes Q6's verdicts even on 1c, whose
  sheet uses `generic` / `tick_values`. The generated checklist reads the real
  verdict set instead.

<!-- qc:EQ.dev4 -->
### 4. A file stimulus arrives as fields, with declared omissions
Guidance omissions are keyed by the bullet's **opening text**, never by its
position in the list, and `resolve_guidance_omissions` raises if a fragment
matches zero or two bullets. An index-keyed draft would have moved the omission
set onto the axis-titles bullet — the item's most common deduction and one the
olx can judge — on any insertion into handout 3's guidance (then `rubric_h3.py`,
now the course file), while
`equivalence.py` went on reporting zero gaps because it read the same indices.

<!-- qc:EQ.dev5 -->
### 5. OLX-only context that the rubric does not ask for, removed

The hand-written prompts passed material the rubric's `context` list does not.
Extra context is exactly the kind of unattributable difference this work exists
to remove, so it is gone; re-add any of it deliberately, with a measurement.
`olx_prompts.py --refs` reports the set.
<!-- qc:EQ.dev6 -->
### 6. A hint read from document formatting is replaced by an explicit input
### 7. Per-check notes on the items whose checklist is shown

A consequence of deviation 3. Where the student SEES the sheet, the feedback is
displayed as a list with each comment under the check it is about, so the runtime
asks for it that way instead of asking for one paragraph:

`LLMAction` appends `slotSheet.slotSheetGuidance()` to **every** slot-sheet
prompt. It has two parts, and only the second is conditional:

* **All 23 items** — `studentFacingGuidance()`: spell out every abbreviation and
  piece of shorthand the rubric uses, and name checks in plain words rather than
  by key. The rubric is written for a grader and its shorthand is all in the
  prompt, so it is all within reach of the prose; the student has not read the
  rubric, and "your UTB is clear" is feedback they must decode before they can
  act on it. Restated in the `feedback` and `note` schema descriptions, which the
  model reads while filling those fields rather than while planning the answer.
* **The 20 items whose checklist is shown** — `checklistGuidance()`, saying each
  check's `note` appears directly beneath it, so notes stand alone, do not repeat
  one another, are written for passing checks too, and are capped at two short
  sentences. With it, `buildSlotSchema(..., perCheckNotes=true)` adds a
  **required** `note` to every non-computed check and re-describes `feedback` as
  a one-or-two-sentence opening.

  It also re-describes **`evidence`**, which the python treats as an internal audit
  field and the olx now DISPLAYS under its check. The olx therefore asks for the
  shortest verbatim span in quotation marks; the python asks only for "quote from
  the student, or what you looked for and did not find". Same field, same
  purpose, a stricter contract on the side where a student reads it — and the
  reason the olx does not ask for a quote in the prose: the span is already on
  screen, so a note saying "that sentence" would point at something the reader
  cannot identify while the words sit directly above it.

Neither is in the .olx: both are appended at runtime, keyed off `showChecks`.
`olx_prompts.py` deliberately does not reproduce them — generating them into the
prompt bodies would send them twice on the olx, and would make `--check` demand
text in the files that the runtime already supplies.

**Scope.** The student-facing half reaches all 23 sheets. The other half is a
fork rather than an on/off: the 20 shown sheets get `checklistGuidance()` and
per-check notes, and the three with `showChecks="false"` — `bmod_h1_q5`,
`bmod_h3_assessment`, `bmod_h3_improve` — get `terseFeedbackGuidance()` instead,
capping `feedback` at four sentences and saying so again in the schema.

That cap exists because hiding the checklist removes what was doing the
compressing. With checks shown, every comment is pinned to one check and capped
at two sentences; with them hidden the model has one open field, the whole
sheet's findings in view, and nothing telling it to stop. These are precisely the
items chosen to be graded generously, and burying that in six paragraphs is its
own kind of discouraging. All three items therefore still differ from the python —
by the student-facing block and the length budget. Keying the spell-out rule off `showChecks` would
have exempted exactly the items whose output is nothing but prose.

**Why it is permitted.** It is a display difference, not a grading one. `note`
is prose rendered under its own check; it is never scored, and no verdict, point
value or deduction wording depends on it. The schema property is added, not
substituted: `verdict` and `evidence` are unchanged, so every check the python makes
the olx still makes, in the same words.

**Why it needed writing down anyway.** `equivalence.py --enforcement` compares
scoring behaviour, not prompt text, and is byte-identical across this change. An
audit that cannot see a difference is exactly the case the declaration contract
exists for.

**What it may move.** Output length: the model now writes 8-11 notes per item,
under an `interactive` budget of 16384 that covers reasoning and output together.
A olx-vs-gold figure measured before this change was measured on shorter
completions; re-run `agreement_app.py` before comparing across it.

## `forbid`: the same rule, reached three different ways

Verified deliberately, after wiring `A_NONE`/`C_NONE` on Q4a/Q4c exposed that the
two sides did not implement this primitive the same way at all.

**The olx** parses `forbid="key:slot=value,slot=value"` from the sheet, computes
the check in `satisfiedMap`, and strips the key from the response schema. General:
any item can carry a rule and nothing is hand-written per item.

**The python** had NO general implementation. `forbid` existed only as a hand-written
branch, `if item.get("id") in POLARITY_GATE_ITEMS`, computing one specific
conjunction for one item family. Its schema-exclusion set covered `equals` keys
and `counts` members but not `forbid` keys.

**The harness mirror** (`agreement.apply_computed`) was general, like the olx.

So declaring a `forbid` rule on a NEW item produced a three-way split: the olx
computed it, the harness computed it, and the python ASKED THE MODEL for it -- a
question answerable from two verdicts the model had already given, which spends a
judgement and invites it to contradict itself. Nothing compared the two, because
the enforcement audit compares DECLARATIONS and a hand-written branch declares
nothing.

**Now:** `score.py` reads `item["forbid"]` from the rubric, computes it beside
`equals`, and strips the keys from both its schema and its prompt. The rule is
declared on both sides -- the OLX attribute for the olx, the rubric key for the
python -- exactly as `counts` and `equals` already were. The POLARITY_GATE_ITEMS
branch still stands and should fold into a declared rule on those items; it is
recorded in `enforcement.HANDCODED_ITEM_RULES` so it cannot be forgotten.

### Gates on computed checks

A gate whose slot is COMPUTED cannot be found by behavioural probing: the probe
fails each INPUT in turn, and a computed key is not an input. `probe.test.ts`
reports such gates in `declaredGates` rather than `gates`, and the enforcement
comparison read only the latter -- so a computed gate looked python-only when both
sides gate. The comparison now accepts either.

The olx gate is real and was checked against the app rather than assumed:
`pickGate` fires on `slot.gates && !sat[key] && charged[key]`, and `chargedMap`
marks every slot chargeable unless an `onlyif` suppresses it. Neither item has
one, so the third condition is a no-op there. A synthetic both-absent sheet scores
0.0 on both items.

### The general lesson, now enforced

A rule expressed as a PRIMITIVE is compared between the two scorers. A rule
written as `if item["id"] in SOME_SET` is compared by nobody.
`check_no_undeclared_handcoded_rules` now enumerates every item-keyed branch in
`score.py` -- eighteen of them -- and requires each to carry a reason in
`HANDCODED_ITEM_RULES`. It does not forbid hand-coding; some rules have no
primitive. It forbids hand-coding silently, and it fires in both directions: a new
undeclared branch, and a declaration whose branch has gone.

## The criteria prose: one source, and the three substitutions that remain

The eight `derive_from_criteria` items (DAY1, DAY2, WK1, WK2, NR, PR, PP, NP) are
graded from a numbered criteria sheet rather than a credit list. That sheet's
prose used to exist TWICE: in `score.py:build_prompt` and in
`olx_prompts._criteria_section`, whose docstring described itself as
"score.py:build_prompt's derive_from_criteria block, verbatim."

It had stopped being verbatim. Three criteria had drifted: two carried
different worked examples on each side, and a third's rule was a shorter, older
version on the python than the one the olx had grown. The three, with their
text: the course half. Every audit stayed green
throughout, because each side was self-consistent and this prose is authored in
the SCORERS rather than in the rubric — so it fell exactly between the prompt
audit, which asks whether the olx carries each RUBRIC element, and the
enforcement audit, which compares DECLARATIONS. Neither has any notion of two
scorers holding two copies of the same paragraph.

`leakage.py` could not see it either: it scans rubric `guidance`/`rule` strings
and `SLOT_NOTES`. The python's copy had never been scanned, and the two drifted
examples were precisely the ones the olx-side leakage rewrite had replaced.

**score.py now calls `_criteria_section`.** One source, nothing to keep in step.
Which criteria get asked follows `build_schema` rather than an item id, so the
prompt cannot describe a field the answer sheet does not collect — the bug that
put "put it in `evidence`" in front of a model whose sheet has no evidence field.

Three substitutions remain. Each is forced by the python's ANSWER SHEET, not by any
difference in judging, and these are all of them:

| substitution | why it is forced |
|---|---|
| `` `evidence` `` → `` `behavior` `` | the python's `oc_analysis` object has no evidence field; the olx's checklist does |
| `` `yes` ``/`` `no` `` → `true`/`false` | its criteria are booleans; the olx's checklist answers yes/no |
| drop "one point, and it charges ONLY this:" | the olx's checklist slot carries a point value the model applies; on the python the engine computes the score and the model never sees points |

They are applied by `olx_prompts._as_criterion`, in one place. The list format
differs too — a numbered criteria sheet against a bulleted checklist — so the
prefix and trailing period are not the same characters. Nothing else differs:
191 of 200 python criteria sentences are verbatim olx text after the substitutions,
and each of the other 9 was confirmed character-identical in its rule BODY.

<!-- qc:EQ.olx-wrong -->
### Where the olx is not authoritative

OLX wording wins wherever the two differ. The exception is where the olx is
plainly self-contradictory.
### What keeps it from growing back

`enforcement.check_criteria_prose_has_one_source` fails the build if that branch
stops delegating, or if prose reappears inside it. It sums the TOTAL length of
string literals in the branch rather than measuring the longest one: adjacent
literals are concatenated at parse time, so the original block was one huge
constant, but a copy reassembled with `+` is a dozen short ones — and the first
version of the check passed a synthetic paste built exactly that way. Both halves
were proved to fire before the check was trusted.

The check deliberately does NOT diff the two texts. Once there is one source
there is nothing to compare, and a check that compares a thing with itself passes
forever.

`consequence_asserted` and `trigger_behavior` are now read by BOTH scorers, so
`check_slot_rules_reach_both_prompts`' premise — SLOT_NOTES is olx-only — is
false for them. They are exempted through `olx_prompts.CLI_CRITERIA_NOTES` rather
than through a list inside the check, and `consequence_asserted` left that
check's BACKLOG by being fixed rather than by rotting.

<!-- qc:EQ.divergences -->
## Scoring divergences (arithmetic, not prompt text)

    python3 equivalence.py --scoring

`increment` on a rubric record is documentation; no scoring code reads it.
Where a divergence is **forced** there is nothing left that could be brought
into line, and it is declared in `olx_prompts.SCORING_DIVERGENCES`. A
retracted finding is as worth recording as a fixed one, so withdrawals are
written up beside fixes.


## Fixtures — settled, do not re-litigate

Fixtures come from `out/hN/participant_NNN.json`, the per-component evidence
`score.py` already extracted for all 20 participants of all three handouts.
Three regex splitters and a hand-read table were written before anyone noticed
that data was on disk; it is the decomposition the olx's separate fields need.

* `from_scorer` — one component, one field. Correct where a component maps to a
  discrete answer.
* `anchored: True` — locate each evidence quote in the original and slice from
  one anchor to the next. Needed where a component maps to discursive prose, in
  which case the quote is only the sentence that earned the point. Q3 lost up to
  41% of the student's words before this; retention went 83% → 99% median.
* `handsplit/Q4b.json` — read by hand; its modify box holds two components in
  one sentence.
* Retention does **not** predict harm: item 3 keeps 64% and scores 95%, because
  its dropped text is preamble. Check retention per item, do not assume.
  **[The 64% is an older reconstruction.** On the current fixture item 3 drops
  nothing in any of its 20 cells — "ASSIGNED TO NO BOX: nothing" everywhere. The
  lesson stands; the number no longer describes this item.**]**

<!-- qc:EQ.sweep -->
## Measurement state — the full sweep
### The noise floor, measured by accident

The most useful number in this file, and it came from a change that could not
possibly matter.

The doubt channel was added to the ten sheets that lacked it — unscored, non-gating,
last. `scoreSlotSheet` cannot see it: max is unchanged on every item, no gate is
added, nothing is deducted. The arithmetic is provably identical.

**Like-for-like on 173 cells: 139/173 (80%) → 135/173 (78%). Fourteen cells
moved** — four fixed, eight broke, two wrong both ways. On a change with no
mechanism.

So at n≈173, one run per cell, roughly **8% of cells move between runs on their
own, with net swings of ±4**. That is the floor. Consequences:

* Two re-runs now bracket the floor: 14 of 173 cells moved on a provably
  score-neutral change, 6 of 156 on a flat one — so **4–8% of cells move per
  re-run.** No single-run delta of a few cells means anything. That includes the +4
  recorded for the `unclear` fix above — its evidence was never the delta, it
  was that all six fixes landed on slots the change touched while both
  regressions landed on slots it did not. Keep reading these rounds that way:
  **attribution, not arithmetic.**
* The corpus figure should be read as 85% ± a couple of points, not 85%.
* Before trusting any future comparison, run the same config twice and subtract.
  That null experiment has still not been run and would cost one sweep.

## What the audits were not looking at

Twenty enforcement findings and one schema divergence were standing open when
the verdict standardisation was committed; the commit message said there were
none. They are recorded here because each was invisible to the audit that
should have caught it, and the reason differs every time.

**`demonstrates_type` was asked and forbidden at once.** `_checklist_section`
builds its skip set from `equals`, `derived` and `counts`. `expect` excludes
keys from the schema exactly as `equals` does, and was never added, so the four
example screens listed `demonstrates_type` as an answerable check *and* carried
a "DO NOT ANSWER `demonstrates_type`" block about it. The model was told both
things in one prompt. Four lines of generated checklist; regenerating removes
them.

**An alias resolved a deduction to a check that cannot charge.** `web_name`
matched identity first and consulted `ALIAS` only on a miss. That was sound
while a python key never named a olx slot of a different kind — but since `pick`,
`observed_type` names one on both sides, and on the olx it is the
classification, not the check carrying the cost. `demonstrates_type` is that
check. The audit compared the python's charge-once pair against a olx slot worth
nothing and reported eight differences that were an artefact of its own lookup
order. Aliases now win over identity, and the identity candidate is listed last.

**The python dropped sixteen `pick` and nine `count` slots.** `agreement.py` kept
its own copy of the slot grammar whose filter read `len(opts) > 1`. A slot whose
answer is not a verdict list — `pick(operant_or_none)`, `count(3)` — resolves to
zero options, so every one of them was discarded before the schema was built,
while the prompt beside it went on asking for them. `--prompts` compares text
and could not see it; the schema audit could not see it either, because it
compared **one representative slot** on the stated grounds that "build_schema
treats every slot the same way". That stopped being true the moment a slot's
shape depended on its kind. The parser now delegates to `olx_prompts.parse_slots`
rather than being a fourth copy, and the audit builds every sheet and checks
that no declared property is unreachable across all of them.

**`evidence` carried the wrong instruction on every item that shows a
checklist.** Its description is a ternary on `perCheckNotes`, and the audit's
literal-scraper only matched a `description:` followed directly by a quote — so
it silently collected nothing for that field and compared nothing. The python had
the short arm hardcoded and sent it always; the olx sends a longer arm asking
for a verbatim student quote wherever the student reads the checklist. Both arms
are now lifted from the TypeScript, and the scraper reads ternary arms as
alternatives.

**`expect` was uncomputable by the harness.** `agreement.py` is the fifth
consumer of `primitives.json` and the registry lists four. `apply_computed`
gained an `expect` branch — one-sided, reading `refers_to` in preference to
`verdict` the way `satisfiedMap` does — and `load_action` now parses the
`choices` and `expect` attributes it had never read, without which that branch
would have been dead code.

None of these were caught by a type checker or by a passing test. Four of the
five were caught by an audit only after another fix removed whatever was masking
them, which is the argument for running the audits after every stage rather than
at the end.

<!-- qc:EQ.prompt-leak -->
## Prompts that give the answer away

Reading either scorer as better than the other on cells whose answers its own
prompt carries is largely reading which one memorised its own prompt better --
and the stronger model is the one that exploits them. Registering the
citations is a measurement-policy change that moves every denominator in the
project, so it wants to be a decision rather than a side effect of fixing one
item.

## Excluded cells are run, not skipped

Three harnesses decide what to count, and until now they decided differently.
`PER_ITEM_EXCLUDE` lived in agreement.py and agreement_app.py as two hand-kept
mirrors, and in baseline.py not at all — so the paper scorer counted five cells
that both other harnesses drop as unreachable, and its headline rate was
computed over a different denominator from the numbers it was being compared
against. Nothing compared the two tables because they
happened to agree, and nothing noticed the third had none because nothing
looked. The table now lives in handouts.py and the audit checks IDENTITY, not
equality: equal-today is how the last pair survived.

The bigger change is that an excluded cell is now RUN. It used to be cut from
the work list on the reasoning that a cell nothing can score right is not worth
an LLM call. That reasoning discarded the most diagnostic evidence in the
corpus, because the three exclusions do not mean the same thing:

| kind | why not counted | what a MISS means |
| --- | --- | --- |
| `suspect` | the submission is mis-transcribed | nothing — the input is not what the student wrote |
| `self_graded` | the prompt contains this participant's answer AND the grader's decision | **a red flag** — the answer was supplied and the model missed it |
| `unscoreable` | no correct scorer can reach this gold | **expected** — it is the documented behaviour |

Only the rate excludes them; every harness now reports them underneath it.

**It changed one item's reading immediately.** The shipped prompt made it look
like the corpus's worst item. Scored on the cells it should be judged on, the
python returned every one exactly right — and every failure was on a
self-graded cell.

So the item's apparent olx/paper gap was never about judging student writing: it
was one model reproducing answers held in its own prompt and the other not. The
misses are the cells whose text the guidance quotes verbatim, and both harnesses
still credit them — which is what makes the exclusion, rather than the
judgement, the thing being measured. The item, the figures and the three cells
are in the course half.

That is worth keeping as a standing measurement. A `self_graded` miss is a lower
bound on how much the prompt is failing to carry: if a model cannot apply a rule
when the answer is written beside it, the rule is not reaching it.

<!-- qc:EQ.no-image -->
## A declared deviation: a backend that cannot send an image
Two supports keep it honest. `score.py` now stamps `backend` and
`supports_tools` into every participant file, so a results directory can say how
it was produced; where the stamp is missing, baseline.py assumes NO and says so,
because an unstamped directory that scored a graph item blind is
indistinguishable from one that did not (`--tools yes` overrides when the
operator knows). And `check_backend_deviations_declared()` fails the audit if a
backend omits `SUPPORTS_TOOLS`, or claims `True` while its `complete()` never
uses `allow_tools` — the selftest injects exactly that.

## Cleaning up an item: the procedure

Worked out on Q4b, which went from a reported 92% over twelve hand-picked cells
to a measured 88% over all sixteen. Every durable gain came from this order;
every attempt that skipped a step cost cells.

**Rank items by percent correct with exclusions INCLUDED in the denominator, and
start with the worst.** An item that excludes half its cells and still misses
half of what remains is not a good item with awkward cases; it is an item whose
number is being protected. One item here once excluded half its cells and read
well on the rest; it now excludes none and records a higher absolute figure,
which is what makes the ranking honest. (The item and both figures: the course
half.)

**1. Remove exclusions the item gets wrong anyway.** A cell is excluded because
the prompt cites the participant and states the grader's decision, which makes
scoring it recall. If the scorer misses it even so, the exclusion is buying a
flattering denominator and nothing else. Take the citation OUT of the guidance
and the participant out of `cited_participants` together — the citation is what
justifies the exclusion, and `check_citations_match_exclusions` enforces that
they move as a pair. Expect the reported number to FALL; that is the point.

One 3-run pass is not enough to call a cell "wrong anyway". One cell came back
unanimous in BOTH directions on different passes — right three times, then wrong
three times — and settled at an even split over twelve runs. Take at least
two passes before removing an exclusion on the strength of failures, or a
coin-flip cell will look decided.

And the remedy only fits a CITATION. A few-shot exemplar is a different thing:
its whole response and score are reproduced in the prompt as a worked example,
so "remove the language that cites it" means deleting an exemplar the prompt is
built around. Leave those excluded and treat an
unstable one as a DIAGNOSTIC instead — a scorer that cannot reproduce a score
printed in its own prompt is telling you the item's judgement is unstable, and
it will stop flipping when step 2 succeeds. That gives a reading on stability
that is independent of the counted rate.

**2. Remove rules that do not earn their place.** For each rule ask which cells
it fires on and which it rescues. A rule with firings and no rescues is a cost.
Q4b carried an outcome rule that fired on one cell and rescued none, and two
distinctness bullets that governed a single scoreable cell and got it wrong.
Removing them changed no score — which is the proof they were inert.

Prefer stability to percentage here. A configuration that scores the same but
reproduces cell-for-cell across runs is better than one that scores a point
higher and swings by four cells: the second cannot tell you whether your next
change helped. Q4b's spread went 4 -> 0 across this step.

**3. Generalise from the cells it gets wrong against the ones it gets exactly
right — and prefer the ORIGINAL hand-scoring dictionary's wording.** Read the
right and wrong cells side by side and name what separates them. Then check the
dictionary before writing anything: Q4b's derived guidance had replaced the
dictionary's "what are you doing INSTEAD OF engaging in your WGB" with a much
broader "anything happening during the UTB episode", and admitted every failure.
The dictionary is the rubric; the derived guidance is a copy that drifts.

Note where the check ASKS the wrong question, not just where the prose does.
Three rewrites of Q4b's guidance moved nothing because the checklist still said
"is this a first ACTIVE BEHAVIOR?" — a category question every student entry
passes. Slot-specific text belongs in the slot's `rule` field, which both
generators render.

**Do not trust gold's prose to name the slot.** Gold is written to a student,
not to a checklist, and where two slots cover one element its wording is
routinely ambiguous between them — Q6's "did not clarify the first consequence
being affected" fits `state_c1` and `affect_c1` equally, and both cost 1.25.
The score is what is measured, so the question is only whether the item sheds
one slot, not which. Three failed attempts to tighten Q6's `affect_c*` slots
were aimed at a defect that lived on `state_c*`; the sheet's own asymmetry said
so all along, since the antecedent side carried a full operational test
("judge what the change ACTS ON") and the consequence side carried one bare
clause. Where an item's paired slots are lopsided like that, suspect the
lopsidedness before inventing a new rule.

**When both sides render a `rule`, check what each SUBSTITUTES, not just that
it arrived.** `{fail}` keeps a rule vocabulary-neutral, but the two generators
resolve it independently, and Q6's `state_c*` slots keep their vocabulary on
the `cover` group rather than on the credit entry. score.py read only the
credit entry, so a rule about naming the WRONG consequence rendered as
`mismatch` on the olx and `absent` — "the box was empty" — on paper: one rule,
two different findings, every prior audit green. `check_rule_fail_tokens_agree`
now fails when either side's token is outside that side's vocabulary, or when
one falls back to the generic `absent` while the other names a specific extra.

**4. Measure on the python at every stage; it is the cheapest and fastest.** One
item, three runs, a few minutes. Confirm on the olx only when the item looks
settled — the two have agreed cell-for-cell on every configuration measured.
Once an item is clean and aligned, keep going on the cells that still err: form
an actionable hypothesis about WHY it differs from gold and test that.

Two habits that paid for themselves. Predict before measuring and write the
prediction down, because a wrong prediction is a finding — the token fix that
"should" have flipped p8 changed nothing, which is how the tests were shown not
to be inert. And re-run an unchanged configuration when a result surprises you:
a trade of one cell for another looked like noise and reproduced exactly.

<!-- qc:EQ.scored-exactly -->
### "Scored exactly right" had six implementations, and two disagreed in print

One table printed both 67% and 58% for the same twelve cells — the per-item row
and the ALL row, side by side. The difference was one cell, whose gold is a
score its item cannot produce. (Which cell: the course half.)

The phrase "scored exactly right" turned out to have SIX implementations. Two
called `handouts.scores_as_exact`, which allows the nearest reachable value when
gold names an unreachable one. Four re-derived it as `abs(error) < 1e-9`: the
ALL aggregate in `agreement.py`, two aggregates in `baseline.py`, and — the one
that matters most — `exact_of`, the MEDIAN-RUN SELECTOR. So the run chosen for
publication was picked by one rule and then printed under another.

`check_unreachable_gold_is_allowed` did not catch it, and the reason is worth
keeping: it tested that the STRING `scores_as_exact` appeared in each harness,
and it did — in the one code path that used it. Presence is not use. The check
now looks for the ANTI-PATTERN instead, a float equality against gold or an
error variable, and reports the file and line. A tolerance test reads
`<= tol + 1e-9` and does not match, because the bound must be `1e-9` exactly.
Re-injecting the original bug fires it; on its first live run it found two more
real sites in `baseline.py` that had been missed by hand.

The fix is one decision point, `handouts.scored_exactly(item_id, gold, pred)`,
with every site routed through it. Same shape as `stale_claim` below: where
three harnesses each keep a copy of one rule, the rule belongs in `handouts`.

What it changed, on data already measured: Q6's baseline is [7, 8, 8] across its
three runs, not the [7, 8, 7] the strict path reported. Any `3 runs — exact ...`
line published before this was understating, and every per-run count quoted in
this document has been re-derived through `scored_exactly`.

### Examples in a prompt must be INVENTED, and the audit now checks it

`check_citations_match_exclusions` polices citations that name a participant by
number, because those are what `cited_participants` can record. It cannot see an
UNATTRIBUTED reproduction, which gives the answer away just as completely while
leaving the cell in the counted denominator. `check_rule_examples_are_not_corpus`
closes that: an 8-word run shared between an item's prompt and one participant's
answer to that item is a finding, unless that participant is already excluded
there.

Two filters keep it honest. A run appearing in more than one student's answer is
the assignment's own language — "baseline data collection and three weeks of
intervention" is the handout talking — so only runs unique to one answer count.
And `exemplars` are exempt: those reproduce whole answers on purpose, and their
participants are registered.

It found **21 pre-existing cells** across all three handouts on its first run,
declared in `CORPUS_QUOTE_BACKLOG` with the same stale-entry rule the SLOT_NOTES
backlog uses. Each needs its example rewritten and its item re-measured, and
doing twenty-one at once would move every number in the project for reasons
nobody could separate.

Its limit, stated so nobody trusts it too far: it cannot catch a PARAPHRASE. The
one half of a two-cell leak described the answer in different words while
naming its criterion and the verdict, and shares no 8-word run with anything. The check is a
floor. Writing an example while reading a participant's answer is still the
thing not to do — which is exactly how this one happened.

### A cell can be exact for two wrong reasons, and the score cannot tell you

One cell scored gold exactly while failing the WRONG SLOTS: a spurious
mismatch in one slot standing in for the failure gold actually
charges. Two errors, equal and opposite. p4 was the same story with a different
mask. Both looked like settled cells for the whole of step 2, and both "broke"
the moment a correct change removed the cancellation.

So when a change moves a cell that was exact, check WHICH slots moved before
calling it a regression. The useful diff is against gold's own charge, not
against the previous number.

### `requires`, and the linkage experiment that did not survive measurement

`requires="key:cond[:lenient,...]"` — a check is CREDITED only while another
holds. The mirror of `onlyif`, which decides what may be CHARGED. Landed in all
five consumers the registry names, plus `score.py`, with `requires.test.ts`
covering the arithmetic, leniency, unknown conditions and non-transitivity.

It was built for a real gap: Q6 never asks which antecedent's change PRODUCES a
consequence's effect, so a response addressing one antecedent in a single run-on
sentence banks both consequence pairs off one clause. Adding the linkage as its
own check fixed p19 exactly as predicted — the first thing that ever moved it.

It was still reverted: it came out net WORSE than the baseline — one cell
fixed, two broken. A `lenient` variant for `unclear` was measured too and was dominated
on every metric. The primitive stays because it is correct, tested and cheap to
reuse; the Q6 sheet went back to baseline. Fixing p19 is worth doing when it
does not cost two other cells.

Two process notes from it. The audit caught the parity gap the moment the python
started applying `requires` and the olx probe did not — working as intended. And
`_credit_fail` was mis-failing identity slots, flipping `first` to `second`,
which does not FAIL a cover member but re-answers it and makes its sibling a
duplicate; the olx probe already picked a non-label value, so the two harnesses
had disagreed about what "failed" meant for as long as both had existed.

## The fixture audit: every item read out, box by box
<!-- qc:EQ.fixtures -->
### What a readout is

**"Read out" means IN FULL — every line of the box, to the end.** A readout
assembled from first lines is not a smaller readout, it is a different and
misleading document. On 2026-08-24 a WK1 survey built from each cell's first
response line reported that gold credits an answer stating no contingency at
all, and that claim was used to argue no rule could reproduce gold on the item
and a divergence was therefore required. The cell had a second sentence
containing a textbook contingency; read whole, the item's ten gold-bearing cells
separated perfectly. Truncation does not cost you a detail, it hands you a
confident conclusion pointing the wrong way. See QUALITY_CONTROL.md section 1.
### The template residue, and where a normalisation belongs

Closed after the audit, and it is the clearest case in this project of a defect
whose fix belongs at the SEAM rather than in the fixtures. Template subtraction
leaves an orphan punctuation run at the head of a response — item 3's question
ends `... you should not say, "Nothing will be changed"). (6 points: 3 points
per example)`, the stem strip takes the words, and the `")"` survives — and
where a box starts at the beginning of the response, that run reached the
grader as the student's first characters. 47 boxes across 13 items: item 3's
fifteen `")"`, handout 2's twenty-three `"_"`/`"; "` blank rules, Q3's five `"-
"`, and four more in Q1, Q2 and Q6.

Three things worth keeping from fixing it.

**It went in `segment.strip_orphan_head`, one normalisation where a section's
text is finalised, so every harness reads the same input.** Forty-seven
per-cell corrections would have been the wrong shape — and would have had to be
renewed every time the segmenter changed.

**What NOT to strip is the whole design.** `(`, `"`, `'` and `[` are excluded
because they open student text — Q5's "(Gaining something.)" is an answer — and
digits are excluded because `"1)"` is the student's own numbering. That is the
line between template punctuation and the student's: the fixtures strip a list
marker per box, and the response keeps it and shows it as belonging to no box.

**A value the paper scorer STORED never passes through segmentation.** Fixing
the seam left sixteen boxes untouched, because `from_scorer` strings quote the
same residue-bearing response into JSON on disk. `_quoted_span` strips those
with the same rule, which left exactly four: one box that comes
from the frozen consensus, and three boxes this very audit had set from
residue-bearing text. All four carry declared corrections. **The general form:
a normalisation at one seam does not reach a value that was captured upstream
of it, and the fixtures are full of captured values.**

Verified box by box across the corpus: 38 boxes and 46 response texts changed,
and every change is a pure leading strip — the before-value ends with the
after-value in all 84 cases. Residue boxes corpus-wide: 0. And the reason
nothing caught it for so long is the blind spot
`check_single_box_fixtures_are_verbatim` already documents for mojibake: for a
one-box item, box and response agreed because both were wrong together.

**Template prose inside a scored box.** One cell's `measurable` held the printed
instruction "You must discuss and label each aspect of the SMART goal for full
credit." while its `specific` held the printed question plus TWO aspects, the
student's own measurable sentence among them. So the grader was asked whether
the goal is measurable and shown an instruction — and gold docks p19 that exact
point. Fixed. The same class survives corpus-wide in a milder form: template
subtraction leaves an orphan `")"`, `"_"` or `"; "` at the head of a response,
and where a box starts at offset 0 it was served as the student's first
characters. **47 boxes across 13 items** — now fixed; see the section above.

**The scorer's verdict inside the field being graded — 20 boxes, 10 cells.**
1c's `title`, `x` and `y` held the paper scorer's SENTENCE about the label
rather than the label: `"Weeks" appears as a bolded axis title centred beneath
the day tick values.` The olx grader's question for those slots is whether the
student labelled the axis, and the field it reads answered that question in the
scorer's words. `_ANNOTATED` matched only `"…" — prose`, so a sentence, a
parenthetical and a bracketed run-list all passed through whole; `_quoted_span`
now enumerates the shapes, and was verified against the served fixtures of all
26 items — exactly 1c's 20 boxes move and nothing else does.

**This document was wrong about that last one.** "Q6's overlapping fixture
boxes are FAITHFUL" says of the `_quoted_span` leak: *"It is the only
`from_scorer` item affected — all eight were checked."* 1c's twenty boxes were
affected the whole time, on the item where it mattered most, because there the
box IS the graded value. Eight boxes of one item were checked and the sentence
was written about the corpus.

<!-- qc:EQ.readouts -->
### Lessons that generalise

**Declaring a split is not reading the boxes.** `MULTI_BLOCK_DECLARED` records
that someone examined where one box ends and the next begins. Three items were
declared before this pass and all three carried defects. The declaration and
the readout answer different questions. (Which three, and what each defect was:
the course half.)

**A procedure that reports "nothing to see" is indistinguishable from a clean
cell.** `fixture_readout` reached 283 of 520 cells and said "empty response"
for the rest: the handout was guessed from the item name (`1 if
item.startswith("Q") else 3`), which sent all twelve of handout 2's items to
handout 3 where they have no segment, and a cell answered with a chart or a
table had no prose to locate a box in. 220 + 17 cells, silently unreadable,
including the ten that held the leak above. Both fixed; the readout now prints
chart-and-table cells by PROVENANCE — which spec key filled each box — because
the question there is not "is this cut in the right place" but "could this text
only have come from the student?"

**An exclusion silences every other question about its cell.** A cell marked
`unscoreable` is skipped by `check_consensus_spans_are_disjoint`, so an overlap
in its boxes sits exempt for as long as the exclusion stands — not because
anyone judged it faithful, but because the check never looked. Removing the
exclusion surfaces it the same minute. Declaring beats excluding wherever the
choice exists. (The cell this was measured on: the course half.)

**An empty box is sometimes the faithful transcription, and gold says which.**
Where a student repeats one answer verbatim as the next, the fixture may leave
the second box empty — a declared divergence from verbatim reproduction, and
self-enforcing, because `_gold_corroborates_absence` reads the grader's own
wording as the licence on every run. Contrast a box holding text the grader
explicitly charges as inadequate: there the box must hold it, and the scorer
must judge it. An empty box and a bad box are different claims. (Both cells:
the course half.)

**Overlap is a device, not a defect, and the measurements say so twice.** Two
boxes may share one sentence that states an outcome and supplies its evidence,
licensed by the item's own guidance. Such cells are declared in
`CONSENSUS_OVERLAP_BACKLOG` rather than split, on the strength of what splitting
cost elsewhere — a measured collapse, not a preference. (The two cells and the
figure: the course half.)

## Practical notes

* One run per cell; ~30s per cell, so a full sweep is several hours. Verify a
  single cell completes before backgrounding a long run.
* Five runs distinguishes a stable disagreement from noise. Differences under
  ~15 points at n≈18 are not real.
* Per-item exclusions: an item's own exemplar participants (Q6: 6/8/10,
  Q4b: 6/7/19) would be self-graded; H2 drops 2 and 3 as mis-transcribed.
* Six gold divergences are documented in README.md — cases where the graders
  did not apply their own written rule. Both systems reproduce them, so they
  cost both implementations the same and neither is a olx/python difference.
  Subtract them before reading any over-credit pattern as a calibration
  problem; the sixth was added after exactly that mistake.
