# ScoreTable

What each item scored, and what the handout came to. A student finishing a
handout could otherwise read eight separate feedback panels and still not know
their total.

```olx:code
<ScoreTable id="h1_scores"
            heading="Question"
            items="q1_feedback:1. Defining the behaviour|
                   q2_feedback:2. Wanted goal behaviour" />
```

## A runnable example

`DerivedChecks` publishes sheets without a model call, so the whole table works
in the playground. Type in some boxes, press Check on each item, and watch the
total fill in:

```olx:playground
<Vertical id="handout_demo">
  <Markdown>## Question 1 — name the behaviour</Markdown>
  <CapaProblem id="q1" title="Question 1">
    <TextArea id="q1_answer" rows="1" />
    <DerivedChecks id="q1_checks"
                   slots="named:Behaviour named@2"
                   derived="named:present:q1_answer" />
    <SlotSheetGrader target="q1_checks" />
  </CapaProblem>

  <Markdown>## Question 2 — give two reasons</Markdown>
  <CapaProblem id="q2" title="Question 2">
    <TextArea id="q2_a" rows="1" />
    <TextArea id="q2_b" rows="1" />
    <DerivedChecks id="q2_checks"
                   slots="a:First reason@1|b:Second reason@1"
                   derived="a:present:q2_a|b:present:q2_b" />
    <SlotSheetGrader target="q2_checks" />
  </CapaProblem>

  <Markdown>## Where you stand</Markdown>
  <ScoreTable id="demo_scores"
              heading="Question"
              items="q1_checks:1. Naming the behaviour|q2_checks:2. Two reasons" />
</Vertical>
```

Three things to try, each of which shows a decision the block makes:

- **Answer nothing.** Every row reads `—` and the total is `0 / 4`, not `0 / 0`.
  The denominator is what the handout is worth, not what has been attempted.
- **Answer question 1 only.** The total becomes `2 / 4`. Question 2 still
  contributes its 2 to the denominator while showing `—`.
- **Answer one of question 2's boxes.** That row reads `1 / 2`: the table shows
  partial credit exactly as the grader scored it, because it is the same
  arithmetic over the same sheet.

## Attributes

- `items` (required) — the graded items to show, `target:Label` separated by `|`.
  Each id is whatever published the sheet — an `LLMFeedback` or a
  `DerivedChecks` — and the label is the heading the student already knows the
  item by.
- `heading` (optional) — the heading for the FIRST column, i.e. what the rows
  are. Defaults to `Question`.

## Scores come from the sheets, not from the graders

A grader's `score` field is a **fraction** of its own max, so rendering points
from it would mean multiplying by a maximum this block was told separately — a
second copy of every item's total, authored by hand and free to drift from the
sheet it describes. The table goes through `scoreSlotSheet` instead, so it and
the grader cannot disagree: same arithmetic, same data.

It parses the sheet with **the same functions `LLMAction` parses its own
attributes with**, including the slots' `free` verdicts, so a sheet cannot be
worth one thing to the grader and another to this table.

## An unanswered item is not a zero

An item with no sheet yet shows `—` and still contributes its **maximum** to the
total available. Scoring it zero, or dropping it from the denominator, would both
mislead: the denominator would grow as the student worked, and a handout half
done would claim a better ratio than one finished.

## Related blocks

- `SlotSheetGrader` — scores one sheet; this shows many
- `LLMAction` — writes the sheets, and documents every rule attribute
- `SheetValue` — reads a single value out of a sheet
