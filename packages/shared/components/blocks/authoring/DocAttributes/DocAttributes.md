# DocAttributes

One block's attribute reference, embeddable anywhere: `<DocAttributes block="CapaProblem"/>`.

The same generated table the docs browser shows on a block's Overview tab — name,
type, whether it is required, the description, and the permitted values — placed
wherever it is wanted. The Studio uses it to show the reference for whichever block
the cursor is inside.

Attributes are generated from the schema and shown on this block's Overview tab.

## Why documentation is a block

Because the reference is generated from the schema, it cannot be stale, and
embedding it costs nothing to maintain. A hand-written table in the same place
would be a second source of one table.

## Related blocks

- **DocFields** — the sibling, for runtime state rather than authored attributes
- **StateViewer** — what a block is actually holding, as against what it accepts
