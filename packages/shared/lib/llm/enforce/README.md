# Behavior Modification handout scorer

Scores PSYC 1030 Behavior Modification handout submissions item-by-item against
the course's own scoring dictionaries, and measures itself against the 20 rows
of human grading per handout.

| | items | scored pts | cells | item agreement | adjusted | MAE / participant |
|---|---|---|---|---|---|---|
| Handout 1 | 8 | 45 | 156 | 87% | 88% | 0.94 of 45 (n=17) |
| Handout 2 | 12 | 40 | 216 | 94% | **96%** | 1.83 of 40 (n=18) |
| Handout 3 | 6 | 40 | 120 | 94% | — | 0.75 of 40 (n=20) |

*Item agreement* is exact-match over scored cells. *Adjusted* subtracts the cells
where this scorer disagrees with a grader **on purpose**, because the graders
applied their own written rule inconsistently — `handouts.GOLD_DIVERGENCES` names
every one. Handout 3 has none declared, hence the dash. `baseline.py` prints both,
plus the ceilings in `handouts.GOLD_CEILINGS` for criteria gold itself does not
decide consistently. Participant `n` is below 20 where a participant is excluded
as a few-shot exemplar of that item or as mis-transcribed.

**These are Opus numbers.** `score.py` defaults to `--backend cli`, which is Opus;
the web app (side `olx`) and `agreement.py` (side `python`) answer as
gpt-5-mini through lo-blocks. The model is
worth roughly 5 points of corpus mean and up to 50 on one item, so a figure here is
not a figure for what students get. `--backend lo` runs this same prompt on the
shipped model, and `out/SWEEP_2026-08-12.md` has the full four-way comparison.

## Run

```bash
cd <edu.memphis.psych>/scoring

python3 score.py --handout 1                  # all 20 participants
python3 score.py --handout 2 --participants 1 5 12
python3 score.py --handout 3 --items 1c       # re-score one item, merging
python3 score.py --handout 2 --retry-missing  # recover cells a run dropped
python3 baseline.py --handout 3               # compare output to the gold rows
```

Output lands in `out/hN/participant_NNN.json`, one file per participant.

**Always check `unscored cells: 0` before reading a baseline.** The CLI backend
sheds calls under concurrency; a partial run still prints a plausible-looking
table on a biased sample. Keep `--workers` at 4 or below.

## Files

| File | Role |
|---|---|
| `docx_text.py` | Stdlib OOXML text extraction; also reads chart title/axis/legend out of `word/charts/*.xml` for a future Handout 3 item 1c |
| `segment.py` | Splits a submission into `{item_id: student text}` by subtracting the blank template |
| `coursedata.py` | Reads the course file, which is the rubric of record for all three handouts. Everything that scores reads the rubric through here |
| `rubric_h2_source.py` | Handout 2's 12 items **as authored** — the four factories `rubric_export.py` reads to WRITE the course file. Outside the scoring path; it is not what scores. Handouts 1 and 3 have no such file: they held literal dicts, so the course file is a complete record of them and the modules were deleted at Stage 5 |
| `handouts.py` | Per-handout wiring: paths, markers, gold loader, exclusions |
| `backends.py` | `ClaudeCliBackend` (default, no API key needed) and `AnthropicApiBackend` (official SDK, `claude-opus-5`) |
| `score.py` | The engine: builds a per-item prompt, gets a deduction ledger, computes the score |
| `gold.py` | Reads the graders' scores and feedback out of the .xlsx |
| `baseline.py` | Per-item exact-match / MAE / tolerance metrics against gold |
| `agreement.py` | Measures the **lo-blocks** on-screen feedback prompts against the same gold rows |

## Design decisions worth knowing

**One call per rubric item, not per document.** Each item has its own point
ledger and its own feedback cell, and the gold data is per-item, so per-item
calls are both more accurate and directly measurable.

**The model never returns a score.** It returns credit checks plus a deduction
ledger drawn from a closed set of codes; `score = max - Σ deductions`, computed
in Python and clamped to `[0, max]`. Point values come from the rubric record,
not from the model's arithmetic. This mirrors how these graders actually write
("`-1 pt: missing a reason`") and makes every point auditable.

**Scores are not snapped to a grid.** The dictionary implies clean increments
(1.25 on Q6, 1.5 on Q4b), but the graders took off-grid amounts when they
judged it fair — participant 4 scored 6.0 on Q6 via "-2.5 ... -1.5". Snapping
would overwrite scores the gold data shows are legitimate, so `increment` is
advisory metadata only.

**Extraction subtracts the template.** Every submission is the blank handout
with typed answers inserted, so student text is what is left after removing
template lines (exact match, plus fuzzy match for lines ≥40 chars to absorb
transcription typos). This is not cosmetic: Handout 1's template carries a
worked example of its own, and one carries an example data table *and* an
example graph. A student can submit the template's worked example unchanged, and
a grader will score that item zero for it — which is why the subtraction is
load-bearing rather than cosmetic. The corpus case is in this document's
course-specific half.

**Items are scored with their neighbours in context.** Several items are graded
against other items, so each rubric record declares what it needs:
Q2's WGB against Q1's UTB; Q4b/Q4c against Q4a for A≠B≠C distinctness; Q6
against 4a and 4c for matching (the most common deduction in the corpus — 14 of
20 gold rows carry Q6 feedback).

**Implicit criteria are written out.** The dictionary under-specifies. Criteria
that appear only in the graders' feedback — a Q1 "reason" must be a reason to
*intervene*; Q2's reasons must be *benefits*; an antecedent's causal link must
be explained; Measurable needs a tracking *method* — are in each item's
`guidance`, marked `IMPLICIT (from gold)`. These are the difference between 0
and full credit on several items.

**Feedback ≠ deduction.** The graders sometimes leave advisory comments at full
credit, including safety notes ("*Please change this example to remove
something not related to meals*"). So `advisory_note` and `safety_flag` are
separate fields, and an advisory note is folded into the visible `feedback`
string only when something was actually deducted or a safety flag fired —
matching the graders, who leave the cell blank on full credit.

**Abstains rather than guesses.** `escalate: true` when no dictionary code
fits, when the model returned a code outside the closed set, or when
the model is genuinely unsure. Given that per-item scores drive a 150-point graded
project, this is grader-assist, not autograding.

<!-- qc:RM.measured -->
## Measured agreement

The `vN` tables in this section and the two below are HISTORY — each column is a
past calibration pass, kept so a later change can be checked against what it
replaced. **The current numbers are the table at the top of this file**, and they
have moved well past the last `vN` column: handout 1 in particular went 80% -> 87%
after the reasons-counting and guidance-placement work described in the comments
`rubric_h1.py` carried. That module was deleted at Stage 5 and its comments were
carried into the course file with it: `coursedata.rubric_note_runs('Q1')`.

<!-- qc:RM.concurrency -->
## Backend note — concurrency

The 240-call H2 run at 8 workers lost **118 calls** to a transient
`claude exited 1` with empty stderr: rate limiting. `ClaudeCliBackend` now
retries 3 times with exponential backoff and jitter (the previous single
immediate retry was not enough), keeps stdout in the error when stderr is
empty, and `score.py --retry-missing` re-scores only the cells a previous run
left null. Keep `--workers` at 4–6 for a 12-item handout.

<!-- qc:RM.loblocks -->
## Measuring the lo-blocks prompts (`agreement.py`)

The handouts also exist as web activities, authored in `../psychology/`
and run by the lo-blocks engine at `$LO_BLOCKS`, where
`<LLMAction>` blocks give formative feedback on screen. Those prompts were
calibrated by copying findings out of this project, and nothing checked whether
the copy worked. `agreement.py` checks it, against these same gold rows.

It is possible because those prompts now declare their checks as a `slots`
sheet — a strict JSON schema — so the model returns a comparable verdict object
instead of prose. The harness reads each `<LLMAction>` straight out of the .olx
(so it measures what ships, not a copy), fills its `<Ref>`s from a segmented
paper submission, calls the same endpoint the browser calls, derives a score
from the verdicts using the rubric's own point values, and compares.

Scoring happens in the harness only. The student-facing blocks must not score
and do not; a score is simply the one thing gold offers to compare against.

```bash
python3 agreement.py --handout 1                 # Q6
python3 agreement.py --handout 2 --items PR NR
python3 agreement.py --handout 1 --backend cli   # same prompts, different model
```

## Backend note

This machine has no `ANTHROPIC_API_KEY` and no `ant` profile, so the default
backend drives the locally authenticated `claude` CLI with `--json-schema` for
structured output. Two things that path requires: tools must be denied
(`--disallowed-tools`), or the agent reaches for one, burns its turn, and the
call dies with `error_max_turns`; and `--bare` cannot be used, because it skips
the keychain read and the CLI ends up unauthenticated.

For production use `--backend api`, which calls `claude-opus-5` through the
official SDK with adaptive thinking, `output_config.format` structured outputs,
and `cache_control` on the rubric-bearing system prompt.
