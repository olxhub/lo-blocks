# SlotSheetGrader

Scores a **published slot sheet** — the checklist an `LLMAction` (or a
`DerivedChecks`) writes into its target's `checks` field. The grader does not
call a model and makes no judgements of its own: every verdict was decided
earlier, and this block turns them into a score.

A sheet does not have to come from a model. `DerivedChecks` publishes one read
off the page, which makes the whole path runnable with no LLM call — type into
the boxes and press Check:

```olx:playground
<CapaProblem id="data_present" title="Weekly data">
  <Markdown>Enter the data you collected. One point per week recorded.</Markdown>
  <TextArea id="wk1" rows="1" />
  <TextArea id="wk2" rows="1" />
  <TextArea id="wk3" rows="1" />
  <DerivedChecks id="data_checks"
                 slots="w1:Week 1 recorded@1|w2:Week 2 recorded@1|w3:Week 3 recorded@1"
                 derived="w1:present:wk1|w2:present:wk2|w3:present:wk3" />
  <SlotSheetGrader target="data_checks" />
</CapaProblem>
```

Leave a box empty and the item loses exactly that check's point: the grader does
nothing but arithmetic over verdicts decided elsewhere.

### A gate — one finding that costs the whole item

Prefix a slot with `!` and an unsatisfied verdict returns **0** for the item,
whatever else was satisfied, for the case where the rest is moot:

```olx:playground
<CapaProblem id="gated" title="Gated item">
  <Markdown>Name the behaviour you are changing, then give two reasons.</Markdown>
  <TextArea id="behaviour" rows="1" />
  <TextArea id="r1" rows="1" />
  <TextArea id="r2" rows="1" />
  <DerivedChecks id="gated_checks"
                 slots="!named:Behaviour named@2|a:First reason@1|b:Second reason@1"
                 derived="named:present:behaviour|a:present:r1|b:present:r2" />
  <SlotSheetGrader target="gated_checks" />
</CapaProblem>
```

Fill both reasons but leave the behaviour blank and the score is **0**, not 2.
Fill the behaviour and one reason and it is 3 of 4.

### A sheet whose costs do not sum to the item

`max` comes from the sheet's own `max` when it has one, otherwise from the sum of
the slot points. On a deduction-style sheet the costs deliberately do not add up,
which is why an explicit `max` exists:

```olx:playground
<CapaProblem id="deduction_style" title="Deductions, not credits">
  <Markdown>Worth 5. Each fault costs 1, and the faults do not add up to 5.</Markdown>
  <TextArea id="answer" rows="2" />
  <DerivedChecks id="ded_checks" max="5"
                 slots="stated:Answer given@1|second:Second point given@1"
                 derived="stated:present:answer|second:present:answer" />
  <SlotSheetGrader target="ded_checks" />
</CapaProblem>
```

Answer nothing and the score is **3 of 5**, not 0 of 2.

With a model in the loop the sheet comes from an `LLMAction` instead, and nothing
else changes — the grader cannot tell which produced it:

```olx:code
<LLMAction target="feedback"
           slots="claim:States a claim@2|reason:Gives a reason@2"
           ...>
  ...
</LLMAction>
<SlotSheetGrader target="feedback" />
```

## Attributes

- `target` (required) — the component holding the published sheet. The sheet is
  read from its `checks` field.

Everything else the grader needs travels **inside the sheet**, not as attributes
here: the slots with their point values, and every rule that computes a check.

## What it reads

A published sheet carries the slots and the rules in force **when it was
written**, so an old sheet re-scores by its own rules rather than by today's.
`sheetFromJson` names each rule family explicitly — `cover`, `equals`, `onlyif`,
`counts`, `expect`, `requires`, `forbid`, `maps` — and defaults each to empty.

That naming is deliberate and was bought twice:

- `expect` was added to the payload type and passed to the scorer, but the reader
  copied fields **by hand** and never copied it. Four items lost a uniform two
  points on every ungated cell; PR fell from 17/18 to 4/18, and the type checker
  was satisfied throughout.
- `maps` was the **eleventh argument** to `scoreSlotSheet` and was simply not
  passed. The scorer defaulted it to `[]`, so no mapped check was ever computed
  here: the score followed whatever verdict the model happened to answer, while
  the machinery to compute one stood ready. Removing the ask then scored every
  cell flat, because the key had a verdict from neither source.

Both failures are silent — a rule that goes missing does not error, it just stops
satisfying the checks it would have satisfied, and the item loses exactly those
points. It reads as the model getting something wrong.

## Scoring

`scoreSlotSheet` decides in this order:

1. **Computed checks** are resolved from the rules — `equals`, `expect`,
   `forbid`, then `maps` last, so a mapped check may read a pick an earlier rule
   wrote. Counted members are resolved from their group's `count`.
2. **A failed gate** (`!key` in `slots`) returns **0** for the whole item. A gate
   whose `onlyif` condition did not hold does not fire.
3. **Otherwise** the score is the sheet's max less the points of every slot that
   is unsatisfied *and* charged. `onlyif` suppresses a charge; a verdict listed
   in the slot's `free` list costs nothing.

## Notes

- **No sheet, no score.** Until the student presses the button there is no
  published sheet, and the grader reports unsubmitted rather than zero.
- **A sheet with no point values is an error, not a zero** — the grader says so,
  rather than silently scoring nothing out of nothing.
- The same sheet is scored independently by an offline mirror
  (`agreement.py` in the psychology scoring package) as a cross-check. The two
  must agree; where they have not, the cause has always been a rule that reached
  one and not the other.

## Related blocks

- `LLMAction` — writes the sheet, and documents every rule attribute
- `DerivedChecks` — publishes a sheet read off the page, with no model call
- `ScoreTable` — displays what a sheet scored
- `Correctness` — the shared verdict vocabulary
