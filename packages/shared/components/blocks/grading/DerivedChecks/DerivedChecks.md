# DerivedChecks

Publishes a gradeable **slot sheet whose verdicts come from the page**, not from a
model. `SlotSheetGrader` scores a sheet; until this existed the only thing that
produced one was `LLMAction`, so an item whose verdicts are plain facts about the
student's fields could not be graded through the normal path at all.

It renders nothing, and there is no call to make or wait for. The sheet is
republished whenever the watched fields change, so the grader always reads current
verdicts without the student pressing anything.

```olx:playground
<CapaProblem id="dc_demo" title="Weekly data">
  <Markdown>One point per week recorded.</Markdown>
  <TextArea id="dc_wk1" rows="1" />
  <TextArea id="dc_wk2" rows="1" />
  <DerivedChecks id="dc_checks"
                 slots="w1:Week 1 recorded@1|w2:Week 2 recorded@1"
                 derived="w1:present:dc_wk1|w2:present:dc_wk2" />
  <SlotSheetGrader target="dc_checks" />
</CapaProblem>
```

## Attributes

- `slots` (required) — the checklist, same syntax as `LLMAction`:
  `key:Label:opt/opt@pts`, separated by `|`.
- `derived` (required) — which checks are read off the page, and how.
- `verdicts` — default vocabulary for checks that do not name their own.
- `max` — the item's total, where the checks' costs deliberately do not sum to it.

## The `derived` grammar: `key:kind:refs[:template]`

**The `kind` is not optional.** A rule whose kind is not one of the four below is
**silently dropped** by the parser — the check then has no verdict and scores
unmet however the student answers, with nothing reported. Writing `w1:wk1` when
you meant `w1:present:wk1` is the easy way to lose an item's points.

| kind | the check asks | extra |
|---|---|---|
| `present` | is there anything in these fields? | — |
| `contains` | does the answer use one of these words anywhere? | the words, comma-separated |
| `plots` | do these fields hold numbers that would plot? | optional `template` the answer must not simply be |
| `complete` | do **all** the fields hold data, not just some? | optional `template` |

Rules are separated by `|`, refs within a rule by `,`:

```olx:code
<!-- presence: a point per week of data -->
<DerivedChecks id="data_checks"
               slots="baseline:Baseline present@1|wk1:Week 1 present@1"
               derived="baseline:present:f_baseline|wk1:present:f_wk1" />

<!-- contains: did they use the word anywhere in the response? -->
<DerivedChecks id="word_checks"
               slots="named:Names the schedule@2"
               derived="named:contains:f_answer:fixed,variable,ratio,interval" />

<!-- complete: every week, not just some -- and not the worked example's own data -->
<DerivedChecks id="chart_checks"
               slots="all_weeks:All four weeks plotted@2"
               derived="all_weeks:complete:f_b,f_w1,f_w2,f_w3:8,10,8;32,20,22" />
```

`contains` matches the whole answer as one haystack: a student who used the word
in the first box only has still used it.

## Why it carries its own `checks` field

Rather than writing to an `LLMFeedback`, `DerivedChecks` publishes to itself — so
an item with nothing for a model to say does not need a feedback block it would
leave empty.

## Keeping it current

Because it republishes on change, a grader reading its sheet stays current as the
student types. Where you need to fire something else on each change, that is
`OnChange`'s job.

## Related blocks

- `SlotSheetGrader` — scores the sheet this publishes
- `LLMAction` — the other producer of sheets, from a model
- `SheetValue` — reads one value out of a published sheet
- `OnChange` — fires actions when a watched value changes
