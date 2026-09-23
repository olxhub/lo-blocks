# NavigatorReadingDetail

A reading in full — and the one template that renders REFERENCED BLOCKS rather than fields.

One of **Navigator**'s built-in templates. A template is not used on its own: it is
named by a `<Navigator>`, which supplies the data and decides which entry is
showing. **[Navigator](./Navigator.md)** documents the two-pane model, the YAML
data format, and how a template is chosen — this page covers only what makes this
one different.

## What makes this one different

The others lay out an entry's own data. This renders blocks the entry POINTS AT, so
a reading can be real content — markdown, a passage, an activity — rather than a
string in a YAML file. That is the reason to choose it, and the reason it is not
the default.

Attributes are generated from the schema and shown on this block's Overview tab.

## Related blocks

- **Navigator** — the two-pane container these fill
- the other built-in templates: `NavigatorDefaultPreview`, `NavigatorDefaultDetail`,
  `NavigatorTeamPreview`, `NavigatorTeamDetail`, `NavigatorReadingDetail`
