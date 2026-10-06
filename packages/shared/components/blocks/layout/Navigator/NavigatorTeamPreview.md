# NavigatorTeamPreview

A person in the list: the preview template for a team directory.

One of **Navigator**'s built-in templates. A template is not used on its own: it is
named by a `<Navigator>`, which supplies the data and decides which entry is
showing. **[Navigator](./Navigator.md)** documents the two-pane model, the YAML
data format, and how a template is chosen — this page covers only what makes this
one different.

## What it adds

It expects the entry to describe a PERSON, so it lays out the fields a directory
has — a name, a role — rather than a generic title and body.

Attributes are generated from the schema and shown on this block's Overview tab.

## Related blocks

- **Navigator** — the two-pane container these fill
- the other built-in templates: `NavigatorDefaultPreview`, `NavigatorDefaultDetail`,
  `NavigatorTeamPreview`, `NavigatorTeamDetail`, `NavigatorReadingDetail`
