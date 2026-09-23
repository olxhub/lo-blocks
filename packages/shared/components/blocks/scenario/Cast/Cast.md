# Cast

Makes a cast of characters available to everything inside it.

A transparent wrapper: it renders its children and adds nothing visible. What it
adds is `runtime.cast`, so a `<Chat>`, a scenario or an avatar below it can name a
character without being handed the cast itself.

Attributes are generated from the schema and shown on this block's Overview tab.

## Why the cast is threaded rather than repeated

A scenario usually has several blocks that need the same characters. Passing the
cast to each is the shape that drifts — one gets a new character, another does
not. Wrapping them puts the cast in one place and lets position do the work.

## Related blocks

- **CastEditor** — where a cast is built and edited
- **CharacterBuilder** — one character in depth
- **Chat** — the usual consumer
