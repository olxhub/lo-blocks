# DocsBrowser

Searchable, category-grouped sidebar of every block plus a detail pane
showing one block's full documentation — the block behind the standalone
`/docs` pages. The detail pane reuses `BlockDocContent` from the BlockDoc
block, so the browser and the single-block embed (`<BlockDoc block="..."/>`)
never show different content for the same block.

## Usage

```olx:code
<DocsBrowser/>
```

```olx:code
<DocsBrowser selected="Chat"/>
```

## Data source

Block metadata comes from the `get_blocks` MCP tool via `useBlockDocs`. The
sidebar uses a cheap descriptor-level call (names, descriptions,
categories); the detail pane makes a second, heavier call scoped to the
selected block (`readme`, `examples`, `attributes`).
