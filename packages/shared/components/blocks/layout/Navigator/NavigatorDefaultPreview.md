# NavigatorDefaultPreview

The preview pane's default: one entry as it appears in the list, before it is chosen.

One of **Navigator**'s built-in templates. A template is not used on its own: it is
named by a `<Navigator>`, which supplies the data and decides which entry is
showing. **[Navigator](./Navigator.md)** documents the two-pane model, the YAML
data format, and how a template is chosen — this page covers only what makes this
one different.

## When to use it

The fallback. Reach for a named template only when the entries carry fields the
default does not know about — a team member's role, a reading's source.

Attributes are generated from the schema and shown on this block's Overview tab.

## Related blocks

- **Navigator** — the two-pane container these fill
- the other built-in templates: `NavigatorDefaultPreview`, `NavigatorDefaultDetail`,
  `NavigatorTeamPreview`, `NavigatorTeamDetail`, `NavigatorReadingDetail`
