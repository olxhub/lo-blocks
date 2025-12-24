# DynamicList

Repeatable container where users can add or remove instances of a child component. Useful for collecting variable-length responses like lists of arguments, multiple examples, or expandable answers.

```olx:playground
<DynamicList id="arguments">
  <TextArea placeholder="Enter an argument..." />
</DynamicList>
```

## Properties
- `min` (optional): Minimum number of items
- `max` (optional): Maximum number of items

## State
- `count`: Current number of items in the list

## Child Blocks
The child block serves as a template that is repeated for each list item.

## Pedagogical Purpose

Dynamic lists were created for a graphic organizer, where the student was asked to enter (and receive LLM feedback on) multiple supporting arguments. It came up in contexts where students needed to write down a set of notes on a text they read (one note per text area) and a few other contexts as well.

## Common Use Cases

### Supporting Arguments

```olx:playground
<Vertical id="v1">
  <Markdown>Provide evidence to support the claim that learning should be student-directed:</Markdown>
  <DynamicList id="evidence" min="2" max="5">
    <TextArea placeholder="Enter supporting evidence..." />
  </DynamicList>
</Vertical>
```

### Multiple Examples

```olx:playground
<Vertical id="v2">
  <Markdown>Give examples of metaphors:</Markdown>
  <DynamicList id="examples">
    <LineInput placeholder="Enter a metaphor..." />
  </DynamicList>
</Vertical>
```

### Graphic Organizer

```olx:playground
<Vertical id="v3">
  <DynamicList id="pros">
    <Vertical>
      <Markdown>**Pro:**</Markdown>
      <TextArea placeholder="Describe an advantage..." />
    </Vertical>
  </DynamicList>
</Vertical>
```

## Related Blocks
- **Vertical**: Fixed vertical layout
- **SortableInput**: Reorderable list for graded sorting exercises
