# The sequence CRDT (`json-crdt-text`)

The text CRDT underneath `docField`, reached through `../docText.ts`. A
JSON-only reimplementation of the sequence CRDT Yjs uses for text: it keeps
Yjs's IDs, origins, right-origins, tombstone collection, state vectors,
`Item.integrate` ordering, transactions, and text event deltas, while using
inspectable JSON instead of binary updates.

## Where this code lives, and why

Written in a separate `crdt` repository, then copied here. Data structures
like this get developed in isolation first: it keeps the algorithm free of
couplings to this codebase, keeps its churn out of this repo's history, and
keeps each change from having to carry all of lo-blocks as context. Isolation
also absorbs the scaffolding such work generates — harnesses, intermediate
artifacts, throwaway UIs — none of which should land in a repo that is public,
which lo-blocks is and `crdt` is not.

The usual arc is *develop apart → fold in → retire the original*. This one is
large enough that the last step is genuinely undecided. Two live options:

- **Fold in fully.** Bring the differential and fuzz harnesses across, almost
  certainly as their own command rather than inside `npm test`, and retire the
  `crdt` repo. One repo, one checkout, no copying.
- **Keep it external, aligned.** Migrate the `crdt` repo onto this repo's
  TypeScript and test configuration so copies are byte-compatible, and leave
  it upstream. A light lift, and it preserves the isolation above.

**Until that is settled, upstream is authoritative: make algorithm changes
there and re-copy.** That is also where the tests that would catch an
algorithm regression actually run — see below.

## What came across, and what did not

The unit, concurrency, update, and gc suites came along, so a regression here
fails `npm test`. Two mechanical edits were needed:

1. `.js` suffixes stripped from relative imports (upstream resolves NodeNext,
   this repo `bundler`).
2. Tests import `test` from `vitest` rather than `node:test`, and from
   `./index` rather than `../src/index.js`. Assertions still use
   `node:assert/strict`.

**The differential tests against a pinned Yjs checkout and the seeded fuzz
harness did not come across.** They need a Yjs checkout and a compiled
`dist/`, and they are the suites that actually exercise convergence hard. This
is the strongest reason the upstream repo still matters, and the main thing
folding in would have to solve.

## Scope

Plain text only. No formatting, embeds, arrays/maps/XML, awareness, undo
manager, snapshots, or binary Yjs framing. `JsonUpdate` is the transport
boundary and `JSON.stringify` / `JSON.parse` the intended encoding. String
indices, lengths, and clocks are UTF-16 code units, as in Yjs. Upstream
`COMPATIBILITY.md` is the exact statement of scope and deviations, and
`docs/ALGORITHM.md` and `docs/CURSORS.md` cover the integration loop and
selection transformation.

## Known gaps

Not here — the gaps that matter are in how this repo *uses* the CRDT, and they
are documented at their sites: `../docText.ts` for document epochs (which
subsume seed identity, tombstone sunsetting, and cursor anchor validity), the
per-keystroke re-encode cost, and the asynchronous local fold; and
`../../state/bindings/useInputField.ts` for cursor state.

## Reading order

`types.ts` → `ranges.ts` → `text.ts` → `doc.ts` → `update.ts`.
