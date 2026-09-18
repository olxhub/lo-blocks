# SheetValue

Exposes **one value out of a published slot sheet** as a field other blocks can
read. A sheet is JSON in a `checks` field — the slot specs, and per check a
verdict, the evidence that settled it, and the note written for the student.
Everything in it is already a judgement the grader trusts, but it is trapped:
nothing else can read one value out of a JSON blob.

```olx:code
<SheetValue id="their_utb"
            target="q1_feedback" check="utb_stated" part="evidence"
            fallback="utb_typed" />
```

## Attributes

- `target` (required) — the `LLMFeedback` or `DerivedChecks` holding the sheet.
- `check` (required) — which check, by its slot key.
- `part` — which half of that check: `evidence` (the span that settled it,
  default), `verdict` (the answer itself), or `note` (the sentence the student
  reads).
- `fallback` — a component whose value to use **until the sheet exists**. Without
  one this is empty until the student has pressed the button that fills it.
- `strip` — remove surrounding quotation marks (default `true`). Evidence is
  authored as a quotation, and a value dropped into a sentence of its own usually
  wants the marks gone.

## What it is for

Carrying a student's own words forward. A later screen can ask about "the
behaviour you named" and quote it back, using the span the grader itself keyed
on — rather than re-asking, or guessing which field held it.

```olx:playground
<Vertical id="sheetvalue_demo">
  <Markdown>**Name a behaviour you would like to change:**</Markdown>
  <TextArea id="sv_behaviour" rows="1" />

  <CapaProblem id="sv_item" title="Scored">
    <DerivedChecks id="sv_checks"
                   slots="named:Behaviour named@1"
                   derived="named:present:sv_behaviour" />
    <SlotSheetGrader target="sv_checks" />
  </CapaProblem>

  <Markdown>Carried forward from the sheet:</Markdown>
  <SheetValue id="sv_named" target="sv_checks" check="named"
              part="verdict" fallback="sv_behaviour" />
</Vertical>
```

Before the item is checked the `fallback` supplies the student's raw text; after
it, the value comes from the sheet itself.

## Notes

- **A sheet that does not exist yet is not an error.** Without a `fallback` this
  is simply empty until the button is pressed.
- `part="verdict"` exposes the grader's own answer, so a later screen can branch
  on what was decided rather than re-deciding it.

## Related blocks

- `SlotSheetGrader` — scores the sheet this reads from
- `DerivedChecks` — publishes a sheet with no model call
- `LLMAction` — publishes a sheet from a model
