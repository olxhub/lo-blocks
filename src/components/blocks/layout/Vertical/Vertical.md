# Vertical Block

## Overview

The Vertical block is a container that arranges child blocks in a vertical stack. It follows edX OLX conventions and provides basic vertical layout for grouping related content.

## Technical Usage

### Basic Syntax
```xml
<Vertical>
  <Markdown>First block</Markdown>
  <Markdown>Second block</Markdown>
  <Markdown>Third block</Markdown>
</Vertical>
```

### Properties
- `id` (optional): Unique identifier

### Child Blocks
Any block can be a child of Vertical. Children are rendered in document order from top to bottom.

## Pedagogical Purpose

Vertical layout supports content organization:

1. **Natural Reading Flow**: Top-to-bottom matches reading direction
2. **Logical Grouping**: Related content stays together
3. **Simple Structure**: No complex layout to distract from content
4. **Flexible Content**: Any combination of blocks

## Common Use Cases

### Question with Feedback
```xml
<Vertical>
  <Markdown>What is 2 + 2?</Markdown>
  <NumberInput id="answer" />
  <NumericalGrader target="answer" expected="4" />
  <Correctness />
  <StatusText />
</Vertical>
```

### Instructional Sequence
```xml
<Vertical>
  <Markdown>## Introduction</Markdown>
  <Image src="diagram.png" alt="Concept diagram" />
  <Markdown>## Details</Markdown>
  <Markdown>Additional explanation...</Markdown>
</Vertical>
```

### Grouped Inputs
```xml
<Vertical>
  <LineInput id="name" label="Name:" />
  <LineInput id="email" label="Email:" />
  <TextArea id="message" label="Message:" />
</Vertical>
```

## Related Blocks
- **Sequential**: Step-by-step progression with navigation
- **SplitPanel**: Side-by-side layout
- **SideBarPanel**: Main content with sidebar

## Example File
See `Vertical.olx` for working examples.
