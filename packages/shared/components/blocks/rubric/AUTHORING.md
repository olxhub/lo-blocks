# Authoring a rubric item

The 22 documents beside this one are REFERENCE: each names one element, shows one
example, and stops. That answers "what is `Forbid`". It does not answer the
question an author actually has — *I have a rule in my head; which of these
expresses it?* — because a rule is almost never one element. This guide is about
the combinations.

Everything below is measured from a rubric of 26 items, not invented: where it
says "three items do X", three items do X.

## Start by deciding whether the item has a sheet at all

**Three of the 26 have no `Slot` whatsoever.** They are scored from the page:
`DerivedChecks` reads whether a field was filled, `SlotSheetGrader` turns that
into a score, and no model is called. A guide that opens with slots has already
skipped one of the two ways to build an item.

Ask first: *can this be decided by looking at the page?* Data present, a choice
selected, a field non-empty — these are facts, not judgements, and a fact should
never be sent to a model. The model's budget is for things only reading can
settle.

Everything in every item, by contrast: `Credit`, `Deduction`, `Question`. If you
are not writing those three you are not writing an item.

## The nine discriminating primitives, and how far each reaches

    Forbid 7    Equals 6    Onlyif 5    Expect 5    Map 4
    Counts 4    Derived 3   Requires 2  Cover 1

Reach is the point. `Credit` and `Deduction` describe every item and therefore
distinguish none; these nine are where an item says what KIND of judgement it is
making. `Cover` appears once in 26 items — if you reach for it, be sure the
simpler shapes genuinely do not fit.

## The two combinations that carry most of the work

### "The answer contradicts itself" — `Equals` + `Forbid` (3 items)

    <Equals key="matches_chosen_type" left="observed_type" right="named_type"
            lenient="unclear"/>
    <Forbid key="consequence_not_a_setup"
            conds="restriction_authored=created,trigger_expects=g"/>

`Equals` compares two slots the model answered INDEPENDENTLY. Neither answer is
"the right one" — the finding is that they disagree. That is how an item asks
*did the student's own label match what they actually described?* without having
to decide which half was wrong.

`Forbid` fails a check when a COMBINATION of other answers holds. Its conditions
are slots, not prose, so the contradiction is arithmetic over verdicts rather
than a second judgement.

`lenient` is what stops this being brittle: where either side is `unclear`, no
mismatch is established and nothing is charged. A contradiction check without a
lenient value charges the student for the model's hesitation.

### "Do not charge a fault whose premise failed" — `Expect` + `Onlyif` (4 items)

    <Expect key="demonstrates_type" left="stimulus_move" value="given_desirable"/>
    <Onlyif key="targets_goal_behavior" cond="demonstrates_type"/>

`Expect` holds when a slot equals the value THIS item asks for. `Onlyif` makes a
check conditional on another check.

Together they are the premise-then-detail shape: only judge whether the plan aims
at the right behaviour IF it demonstrated the right mechanism at all. Without the
`Onlyif`, a student who misunderstood the mechanism loses points twice — once for
the mechanism and again for a detail that could not have been right given the
first error. Double-charging one mistake is the most common way a rubric feels
unfair to the person reading its feedback.

**When to reach for `Onlyif` instead of `Forbid`:** `Onlyif` suppresses a check;
`Forbid` fails one. Use `Onlyif` when the downstream question stops being
meaningful, and `Forbid` when the combination is itself the fault.

### The rarer pairings, for completeness

`Derived` + `Forbid` (2) and `Derived` + `Map` (2) mix a fact read off the page
with a judgement about prose. `Cover` + `Requires` (1) is the one item that
checks a set of slots covers a set of labels. `Counts` + `Map` (1) counts
instances and then classifies them.

## What this guide does not cover

The `Frame` / `Segment` layer, which is a second axis: shared prose selected by
`ifDeclared` conditions, so several items can carry one criteria block with the
per-item differences spliced in. Reach for it when two items would otherwise hold
the same paragraph twice.
