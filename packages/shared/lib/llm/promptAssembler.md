# Assembling a prompt

Turns one rubric item into the prose a grader is asked to work through.

Its counterpart is `attributeAssembler.ts`, which produces the sheet ATTRIBUTES
that decide scoring. One produces words, the other produces numbers, and they are
kept together for that asymmetry: a wrong word changes a prompt, a wrong `maps=`
changes a score, silently.

## The engine supplies no prose

`Fragments` is every heading and paragraph the assembler needs, and it is supplied
by the CALLER — never defaulted. Baking an English default into the engine would
put course content in lo-blocks, and worse, would make that default the real
source the moment anyone forgot to override it.

**The keys are engine concepts; the words are not.** `frag()` therefore throws on
a missing fragment rather than falling back: a silently truncated prompt is a
scoring change nobody sees.

## Frames and conditions

`renderFrame` takes shared prose in segments and selects among them by name. A
segment with `when` renders only when the item declares that condition, and `!name`
inverts it. The engine decides NOTHING about meaning: `when` is matched against
condition names the item declares, and `{param}` against parameters it supplies —
what any of those names MEAN is never known here.

## Related

- [`attributeAssembler`](./attributeAssembler.md) — the scoring half
- [`slotSheet`](./slotSheet.md) — the schema the answers come back in
- [`materialiseRubric`](./materialiseRubric.md) — expansion, which runs before any of this
