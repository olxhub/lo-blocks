# SetFieldAction

Sets a field value on a target component when triggered. A generic action for dynamically changing component state at runtime.

## Usage

```olx:playground
<Vertical id="sfa_demo">
  <TextArea id="my_input" rows="3" placeholder="Type here..." />
  <ActionButton label="Lock">
    <SetFieldAction target="my_input" field="readonly" value="true" />
  </ActionButton>
</Vertical>
```

## Attributes

| Attribute | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `target`  | string | yes      | ID of the component to update |
| `field`   | string | yes      | Field name to set on the target |
| `value`   | string | yes      | Value to set |

## Value Parsing

Since OLX attributes are always strings, SetFieldAction parses common types:
- `"true"` / `"false"` are converted to booleans
- Numeric strings (e.g., `"42"`, `"3.14"`) are converted to numbers
- Everything else remains a string

## Common Patterns

### Make a TextArea read-only after submission

```xml
<ActionButton label="Submit">
  <LLMAction target="feedback">...</LLMAction>
  <SetFieldAction target="draft" field="readonly" value="true" />
</ActionButton>
```

### Lock a Carousel after selection

```xml
<SetFieldAction target="location_picker" field="readonly" value="true" />
```
