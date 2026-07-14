Blink
=====

A tiny demo of a **dynamic block** — a block loaded into a running server at
runtime, with no rebuild and no restart (see `docs/dynamic-blocks.md`).

`<Blink>` renders its text content with an old-school blinking effect.

```olx:playground
<Blink id="blink_demo">Loading the future…</Blink>
```

This block lives in `blocks-dynamic/Blink/`, deliberately outside the static
block tree (`packages/shared/components/blocks/`), so the static registry
never sees it. It is loaded via the `loadBlocks` MCP tool:

```
loadBlocks({ source: "blocks-dynamic/Blink" })
```

`loadBlocks` requires the `dynamicBlockLoading` PMSS flag, which is on for
development deployments and off everywhere else.
