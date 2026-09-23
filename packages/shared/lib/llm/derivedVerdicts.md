# Derived verdicts

Dispatch for checks whose verdict is read off the page rather than judged: a
field's presence, a word search, a set of numbers that would plot.

## Not a leaf, deliberately

Unlike `slotSheet.ts`, this reaches into the chart's parser — so that a verdict
about plotted data is decided by the same code that plots it. A second
implementation of "would these numbers make a graph" is exactly the drift worth
paying an import to avoid.

## One dispatch, two callers

`LLMAction` comes through here for items that mix derived checks with judgements,
and `DerivedChecks` for items with no model call at all. Both use this so the
dispatch exists once.

## These verdicts name themselves

They are decided HERE rather than by a model, so they have to name the vocabulary
they answer in — a derived check that borrowed a model's verdict names would be
claiming the model had answered it.

## Related

- [`slotSheet`](./slotSheet.md) — the judged checks these sit beside
- **DerivedChecks**, **LLMAction** — the two blocks that call in
