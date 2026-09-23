# NavigatorTeamDetail

A person in full: the detail template for a team directory.

One of **Navigator**'s built-in templates. A template is not used on its own: it is
named by a `<Navigator>`, which supplies the data and decides which entry is
showing. **[Navigator](./Navigator.md)** documents the two-pane model, the YAML
data format, and how a template is chosen — this page covers only what makes this
one different.

## What it adds

The detail counterpart of `NavigatorTeamPreview`. Pair them; a team preview with a
default detail loses the layout as soon as an entry is opened.

Attributes are generated from the schema and shown on this block's Overview tab.

## Related blocks

- **Navigator** — the two-pane container these fill
- the other built-in templates: `NavigatorDefaultPreview`, `NavigatorDefaultDetail`,
  `NavigatorTeamPreview`, `NavigatorTeamDetail`, `NavigatorReadingDetail`
