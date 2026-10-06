# CopyFieldAction

Copies a field value from one block to one or more others when triggered.

## Usage

```olx:playground
<Vertical id="copy_demo">
  <TextArea id="source_text" rows="2" placeholder="Type something here..." />
  <TextArea id="target_text" rows="2" placeholder="Value will be copied here" />
  <ActionButton id="copy_btn" label="Copy Text">
    <CopyFieldAction target="source_text" output="target_text" />
  </ActionButton>
</Vertical>
```

## Attributes

Attributes are generated from the schema and shown on this block's Overview tab —
name, type, whether it is required, the description, and the permitted values.
A hand-kept copy here is a second source of one table, and the copy is what rots.

## Examples

### Copy value (default field)

```xml
<CopyFieldAction target="editor" output="saved_draft" />
```

### Copy a specific field

```xml
<CopyFieldAction target="my_grader.correct" output="status_display.value" />
```

### Fan out to multiple destinations

```xml
<CopyFieldAction target="source_input" output="display1,display2,display3" />
```

## Related Blocks
- **SetFieldAction**: Sets a field to a literal value (CopyFieldAction copies from another block)
- **ActionButton**: Most common trigger
- **OnRender**: Automatic trigger (copy on page load)
