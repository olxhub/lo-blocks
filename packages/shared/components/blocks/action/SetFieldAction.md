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

`value` is always a string in OLX. It is coerced — and validated — by the
**target field's own schema**, not by a generic parser. So the same literal
means different things depending on where it lands:

- a boolean field (`Done.value`, `readonly`) accepts only `"true"` / `"false"`
- a numeric field (`Tabs.activeTab`) accepts numeric strings like `"3"`
- a string field (`LineInput.value`, `TextArea.value`) takes the text as-is

A value the target field rejects is **not** written, and the click has no
other effect. The rejection is reported on the console, naming the
SetFieldAction that failed — if a button appears to do nothing, look there
first. To store a semantic code (`"acknowledged"`, `"explorer"`), target a
string-valued block such as a `<LineInput>` parked in a `<Hidden>`; a `<Done>`
can only hold true/false.

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
