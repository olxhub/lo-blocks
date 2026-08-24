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

`value` is always a string in OLX. The target field's schema, if present,
coerces and validates it. The same literal can therefore mean different
things depending on where it is written:

- a boolean field (`Done.value`, `readonly`) accepts only `"true"` / `"false"`
- a numeric field (`Tabs.activeTab`) accepts numeric strings like `"3"`
- a string field (`LineInput.value`, `TextArea.value`) takes the text as-is

Rejected values are not written. To store a semantic code such as
`"acknowledged"`, target a string field; boolean fields accept only true or
false.

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
