# BlockDoc

Renders one block's full documentation — description, category chips,
attributes table, README, and examples. This is the detail-page component
of the documentation system, and it is an ordinary block — so an authoring
course teaching block usage can embed a block's full documentation
directly in courseware, right next to the lesson that introduces it.

## Usage

```olx:code
<BlockDoc block="Chat"/>
```

## Data source

Block metadata comes from the `get_blocks` MCP tool, with heavier include
levels than BlockIndex uses (`readme`, `examples`, `attributes`) — a detail
page needs the full record, not just names and descriptions.
