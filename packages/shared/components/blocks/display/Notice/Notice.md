# Notice

Renders the platform licensing/attribution notice, or a custom content
notice (e.g. course licensing), inside OLX content. Wraps the same shared
React component that page chrome (StaticPage, the docs browser footer)
uses directly, so notices look identical whether they come from a page or
from content.

## Usage

```olx:playground
<Notice/>
```

With custom content (markdown):

```olx:playground
<Notice content="© 2026 Example Course Authors. Licensed CC BY-SA 4.0."/>
```

## Notes

- With no `content=`, shows the platform notice (project licensing and
  attribution).
- `content=` takes markdown, rendered in the system namespace — notices are
  chrome, not course content with identity of their own.
- No per-instance state; any number of `<Notice/>` instances may appear
  without ids.
