# Vertical

Container that groups blocks in a vertical stack. Use it to combine different block types that need to stay together.

```olx:playground
<Vertical id="greeting">
  <LineInput id="name" placeholder="Your name..." />
  <Markdown>**Hello,**</Markdown>
  <Ref target="name" />
</Vertical>
```

## Properties
- `id` (optional): Unique identifier

## When to Use

Vertical is needed when you want to group multiple block types together:

```olx:playground
<Vertical id="survey">
  <Markdown>Rate your understanding:</Markdown>
  <DropdownInput id="rating">Not at all, Somewhat, Very well</DropdownInput>
  <Markdown>Explain your rating:</Markdown>
  <TextArea id="explain" rows="2" />
</Vertical>
```

For pure text content, a single Markdown block is simpler.

## Related Blocks
- **Sequential**: Step-by-step progression with navigation
- **SplitPanel**: Side-by-side layout
- **SideBarPanel**: Main content with sidebar
