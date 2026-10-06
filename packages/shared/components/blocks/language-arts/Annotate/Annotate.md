# Annotate

Text annotation for close reading: the learner selects text from a passage and
each selection becomes a highlight in the passage and a card beside it.

The passage is the block's children, so it is ordinary content — markdown, a
reading, a transcript — and not a string attribute.

Attributes are generated from the schema and shown on this block's Overview tab.

## What a selection produces

Each annotation has two halves that stay linked: a coloured highlight where the
text was selected, and a card carrying the learner's note. `editor` chooses what
the card offers for writing that note.

## Related blocks

- **TextSelectionInput** — when the selections themselves are what is graded,
  rather than the notes written about them
- **UseHistory** — for replaying what was annotated and when
