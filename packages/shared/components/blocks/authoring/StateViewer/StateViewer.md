# StateViewer

Shows the live value of state while authoring — what a block is actually holding,
as the learner's actions change it.

An authoring and debugging surface: it is how you answer "did that input really
write what I think it wrote?" without instrumenting the page.

Attributes are generated from the schema and shown on this block's Overview tab.

## `scope` decides WHICH state you are looking at

The four scopes are different stores, not four views of one:

- `component` — one block's own field values
- `componentSetting` — the authored settings behind those values
- `system` — runtime state the platform keeps
- `storage` — what is persisted, and therefore what survives a reload

Reaching for the wrong one is the usual reason a value "does not appear": it is
there, in a different store.

## Related blocks

- **DocAttributes**, **DocFields** — the authored surface, where StateViewer shows the live one
