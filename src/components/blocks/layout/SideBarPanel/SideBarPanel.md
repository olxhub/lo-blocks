# SideBarPanel Block

## Overview

The SideBarPanel block provides a two-column layout with a main content area and a sidebar. Content is organized using `<MainPane>` and `<Sidebar>` child elements.

## Technical Usage

### Basic Syntax
```xml
<SideBarPanel>
  <MainPane>
    <Markdown>Main content here</Markdown>
  </MainPane>
  <Sidebar>
    <Markdown>Sidebar content</Markdown>
  </Sidebar>
</SideBarPanel>
```

### Properties
- `id` (optional): Unique identifier

### Named Slots
- `<MainPane>`: Primary content area (left/main column)
- `<Sidebar>`: Secondary content area (right sidebar)

Both slots can contain multiple child blocks.

## Pedagogical Purpose

Sidebars support learning scaffolds:

1. **Supplementary Information**: Notes, hints, or reference material
2. **Progress Tracking**: Show history or status alongside content
3. **Tools Access**: Keep tools visible while working
4. **Contextual Help**: Provide assistance without interrupting flow
5. **LLM Output** Feedback on main panel work
6. **Navigation** To related resources

## Common Use Cases

### Chat with Student Response History
```xml
<SideBarPanel>
  <MainPane>
    <Chat src="discussion.chatpeg" />
  </MainPane>
  <Sidebar>
    <UseHistory target="student_input" />
  </Sidebar>
</SideBarPanel>
```

### Content with Reference
```xml
<SideBarPanel>
  <MainPane>
    <Markdown>Main lesson content...</Markdown>
    <NumberInput id="answer" />
  </MainPane>
  <Sidebar>
    <Markdown>
## Formula Reference
- Area = πr²
- Circumference = 2πr
    </Markdown>
  </Sidebar>
</SideBarPanel>
```

### Problem with Hints
```xml
<SideBarPanel>
  <MainPane>
    <ChoiceInput id="q1">...</ChoiceInput>
    <KeyGrader target="q1" />
  </MainPane>
  <Sidebar>
    <Markdown>### Hint</Markdown>
    <Markdown>Think about...</Markdown>
  </Sidebar>
</SideBarPanel>
```

## Related Blocks
- **SplitPanel**: Configurable column proportions
- **Vertical**: Simple vertical stacking

## Example File
See `SideBarPanel.olx` for working examples.
