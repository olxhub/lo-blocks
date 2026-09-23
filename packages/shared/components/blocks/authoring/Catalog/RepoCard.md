# RepoCard

One repository's card: its launchable activities, and the building blocks it
contributes.

Attributes are generated from the schema and shown on this block's Overview tab.

## It is used two ways, and that is deliberate

As a child of `<Catalog>` it is rendered once per repository, receiving that repo
directly — so a catalog is a list of these rather than a bespoke layout. Used on
its own with `origin`, it shows a single named repository, which is what a landing
page usually wants.

`compact` drops the building-blocks section, leaving the launchables.

## Related blocks

- **Catalog** — the list this fills
