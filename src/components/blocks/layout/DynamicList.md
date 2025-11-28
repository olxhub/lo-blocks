# DynamicList Block

## Overview

The DynamicList block creates a repeatable container where users can add or remove instances of a child component. It's useful for collecting variable-length responses like lists of arguments, multiple examples, or expandable answers.

## Technical Usage

### Basic Syntax
```xml
<DynamicList id="arguments">
  <TextArea placeholder="Enter an argument..." />
</DynamicList>
```

### Properties
- `id` (required): Unique identifier
- `min` (optional): Minimum number of items
- `max` (optional): Maximum number of items

### State Fields
- `count`: Current number of items in the list

### Child Blocks
The child block serves as a template that is repeated for each list item.

## Pedagogical Purpose

Dynamic lists were created for a graphic organizer, where the student was asked to enter (and receive LLM feedback on) multiple supporting arguments. It came up in contexts where students needed to write down a set of notes on a text they read (one note per text area) and a few other contexts as well.

## Common Use Cases

### Supporting Arguments
```xml
<Markdown>Provide evidence to support your claim:</Markdown>
<DynamicList id="evidence" min="2" max="5">
  <TextArea placeholder="Enter supporting evidence..." />
</DynamicList>
```

### Multiple Examples
```xml
<Markdown>Give examples of metaphors:</Markdown>
<DynamicList id="examples">
  <LineInput placeholder="Enter a metaphor..." />
</DynamicList>
```

### Graphic Organizer
```xml
<DynamicList id="pros">
  <Markdown>**Pro:**</Markdown>
  <TextArea placeholder="Describe an advantage..." />
</DynamicList>
```

## Related Blocks
- **Vertical**: Fixed vertical layout
- **SortableInput**: Reorderable list for graded sorting exercises

## Example File
See `DynamicList.olx` for working examples.
