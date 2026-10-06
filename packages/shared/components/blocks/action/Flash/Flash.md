# Flash

A momentary highlight on another block — a way to point at something without
moving the page.

Renders nothing of its own: it is an action, placed inside whatever triggers it.

```olx:playground
<Vertical id="flash_demo">
  <Markdown id="flash_target">The paragraph that will be pointed at.</Markdown>
  <ActionButton id="flash_btn" label="Look here">
    <Flash target="flash_target" color="gold" duration="500ms"/>
  </ActionButton>
</Vertical>
```

Attributes are generated from the schema and shown on this block's Overview tab.

## Why a flash rather than a scroll

Scrolling moves the reader; a flash tells them where to look while leaving the
page where they put it. Use it when the target is already on screen.

## Related blocks

- **ActionButton** — the usual trigger
- **CompactPopout** — when the thing being pointed at needs opening rather than pointing at
