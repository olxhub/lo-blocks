# Hint

One hint, used inside `<DemandHints>`.

It has no attributes of its own: a hint is its content, and the order the hints
are given in is the order they are written.

## It is not used alone

`<DemandHints>` owns the sequence — how many have been taken, and what taking one
costs. A `<Hint>` outside it has nothing to sequence it.

## Related blocks

- **DemandHints** — the container that gives them out one at a time
- **Explanation** — shown after answering, rather than on demand before
