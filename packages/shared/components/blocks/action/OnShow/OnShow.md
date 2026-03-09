# OnShow

Runs actions automatically when the student reaches a section. Like ActionButton, but without needing a click.

```olx:playground
<Sequential id="draft_revise">
  <Vertical title="Draft">
    <Markdown>Write a short paragraph about a topic you're studying.

You'll revise it in the next section. You won't be able to change your draft once you advance.</Markdown>
    <TextArea id="draft" rows="4" placeholder="Write your first draft here..." />
  </Vertical>
  <Vertical title="Revise">
    <OnShow>
      <CopyFieldAction target="draft" output="revision" />
      <SetFieldAction target="draft" field="readonly" value="true" />
    </OnShow>
    <Markdown>Your draft has been copied below. Revise it to improve clarity and structure.</Markdown>
    <TextArea id="revision" rows="4" />
  </Vertical>
</Sequential>
```

When the student advances to "Revise", the OnShow copies their draft into a new text area and locks the original.

## Attributes

| Attribute | Type   | Default | Description |
|-----------|--------|---------|-------------|
| `trigger` | `"first_view"` \| `"each_view"` | `"first_view"` | `"first_view"` runs actions once (even if the student navigates back and forth). `"each_view"` runs them every time. |

## Examples

### Lock an answer when the student sees the explanation

```xml
<Sequential id="predict_explain">
  <Vertical title="Predict">
    <Markdown>What happens to the current when you double the resistance?</Markdown>
    <TextArea id="prediction" rows="2" />
  </Vertical>
  <Vertical title="Explanation">
    <OnShow>
      <SetFieldAction target="prediction" field="readonly" value="true" />
    </OnShow>
    <Markdown>By Ohm's law (I = V/R), doubling resistance halves the current.</Markdown>
  </Vertical>
</Sequential>
```

### Unlock a tab after the student reads something

```xml
<Tabs id="gated">
  <Vertical title="Read First">
    <Markdown>Read this passage carefully before continuing.</Markdown>
    <OnShow>
      <SetFieldAction target="respond" field="enabled" value="true" />
    </OnShow>
  </Vertical>
  <Vertical id="respond" title="Respond" enabled="false">
    <TextArea id="response" rows="3" placeholder="Now write your response..." />
  </Vertical>
</Tabs>
```

## Related
- **ActionButton** — same idea, but the student clicks a button
- **CopyFieldAction** — copies a value from one block to another
- **SetFieldAction** — changes a field on a block (lock, unlock, set a value, etc.)
