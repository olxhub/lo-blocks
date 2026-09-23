# Assembling the sheet attributes

Generates the attributes that decide SCORING, from the rubric.

The other half of the assembler. `promptAssembler.ts` produces the prose a grader
reads; this produces what the score is computed from. They belong in one gate
because the consequences are asymmetric: a wrong word changes a prompt, a wrong
`maps=` changes a score, and only one of those is visible on reading the output.

## Absent is not empty

Every function returns `null` where the item declares no such rule, rather than an
empty string. An EMPTY attribute and an ABSENT one are different bytes in the
generated content, and the generator this mirrors makes the same distinction —
comparing the two is how the generated `.olx` is checked.

## Content-neutral

Every grammar here is an engine concept — `counts="key:slotA,slotB"` and its
siblings. The slot and verdict names threaded through them are data the caller
supplies. That is what keeps one course's vocabulary out of the engine.

## Related

- [`promptAssembler`](./promptAssembler.md) — the prose half
- [`slotSheet`](./slotSheet.md) — the answer schema
