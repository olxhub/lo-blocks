# Parsing OLX that was never a file

`xml2json.ts` parses the authored `content/` tree. This script parses OLX
**strings**, and it exists because some content never reaches the tree at all.

An `OlxSlot` renders OLX that a student or an LLM wrote at runtime — the value of
a `CodeInput`, edited on screen. That content has no file, so `xml2json` never
sees it, and nothing downstream can say what the ids in the event stream refer
to.

```
{ "<key>": { "ns": "demos", "olx": "<Sequential id=\"student_sequence\">…" } }
       ↓
{ "<key>": { "idMap": {…}, "root": "demos/student_sequence", "errorCount": 0 } }
```

```
npm run olx-string-idmaps -- --jobs jobs.json --out out.json
```

## Why the parser has to be this one

The ids are a **product of the parse**. A block with no `id` is given one by
`createId()`, which hashes its parsed node — so `demos/_bab4056…` is not a name
anyone chose, it is a fact about how this parser built that node.

The consequence is stronger than "don't repeat yourself". A second
implementation would not drift over time; it would be **wrong immediately**,
minting ids that match nothing in the event stream. And it would fail silently:
no exception, no empty output, just resolutions that quietly stop happening.

So the script mirrors `OlxSlot/_OlxSlot.tsx` exactly — same `parseOLX`, same
`toLofsRef('validate://')` provenance, same absent provider, same namespace — and
ships from the same build as the parser it wraps. `olx_string_idmaps.test.ts`
holds that: it compares the script's whole idMap against a runtime-shaped
`parseOLX` call, and separately reads both call sites to catch either one
changing.

## Its caller is outside this repository

Nothing in lo-blocks imports or spawns this script. The consumer is the event-log
pipeline's `process_events.py`, which runs it with `tsx` against a lo-blocks
installation root and feeds the result to the same `build_*` helpers it uses for
authored content.

That is the same seam shape as `lib/llm/runner.test.ts`, whose caller is likewise
an external analysis harness. It is written down in both places because "no
in-repo callers" otherwise reads as dead code — and deleting this removes
dynamic-OLX id resolution from every processed capture, with no lo-blocks test
failing to say so.

## What it does with content it cannot parse

A job is **omitted from the output**, never emitted with an empty map: the caller
then finds no maps for it and falls back to attaching no resolution. An empty
`idMap` under the key would instead read as "parsed fine, and this content has no
ids", which is a different and wrong claim. A namespace the grammar rejects is
skipped on the same reasoning — it cannot have produced runtime ids.

`errorCount` is reported but not gated on. The strings come from the host's own
`validOlx` field, which the runtime sets only after an error-free parse, so a
populated idMap here is structurally complete even when a residual content
warning rides along.
