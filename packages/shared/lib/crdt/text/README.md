# Vendored sequence CRDT (`json-crdt-text`)

The text CRDT underneath `docField`. **Vendored source — edit upstream first.**

Upstream: the `crdt` repository (`json-crdt-text`), a JSON-only reimplementation
of the sequence CRDT Yjs uses for text. It keeps Yjs's IDs, origins,
right-origins, tombstone collection, state vectors, `Item.integrate` ordering,
transactions, and text event deltas, while using inspectable JSON instead of
binary updates.

## Why vendored rather than a dependency

lo-blocks typechecks and bundles TypeScript source directly (vite, tsx,
vitest); a dependency would need a build step, a publish/pin workflow, and a
stricter tsconfig than this repo's. Vendoring keeps one repo, one `npm test`.

Only two mechanical changes were made when copying `crdt/src/*.ts` here:

1. `.js` suffixes stripped from relative imports (NodeNext upstream, `bundler`
   resolution here).
2. Tests import `test` from `vitest` instead of `node:test`, and from `./index`
   instead of `../src/index.js`. Assertions still use `node:assert/strict`.

## What did NOT come along

The differential tests against a pinned Yjs checkout (`npm run setup:yjs`) and
the seeded fuzz harness (`npm run fuzz`) stay upstream — they need a Yjs
checkout and a compiled `dist/`. Changes to the algorithm belong upstream,
where those run; this copy carries the unit, concurrency, update, and gc
suites so a regression here fails `npm test`.

## Scope

Plain text only. No formatting, embeds, arrays/maps/XML, awareness, undo
manager, snapshots, or binary Yjs framing. `JsonUpdate` is the transport
boundary; `JSON.stringify` / `JSON.parse` are the intended encoding. String
indices, lengths, and clocks are UTF-16 code units, as in Yjs.

Upstream `COMPATIBILITY.md` is the exact statement of scope and deviations;
`docs/ALGORITHM.md` and `docs/CURSORS.md` explain the integration loop and
selection transformation.

## Reading order

`types.ts` → `ranges.ts` → `text.ts` → `doc.ts` → `update.ts`.
