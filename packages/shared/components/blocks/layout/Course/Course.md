# Course

Provides a hierarchical course structure with chapter-based navigation. Displays an accordion navigation sidebar on the left and selected content on the right. Modeled after the original Open edX user interface, designed to facilitate easy import of Open edX courses.

## Syntax

```olx:code
<Course title="The Science of Learning">
  <Chapter title="Retrieval Practice" id="ch1">
    <Sequential>...</Sequential>
    <Vertical>...</Vertical>
  </Chapter>
  <Chapter title="Spacing Effect" id="ch2">
    <Markdown>Content here</Markdown>
  </Chapter>
</Course>
```

## Properties
- `id` (optional): Unique identifier
- `title` (required): Course title displayed in header

## Chapter Structure

Each `<Chapter>` element requires:
- `id` (required): Unique identifier for the chapter
- `title` (required): Display title in navigation
- Child blocks: Content to display when chapter is selected

## State Fields
- `selectedChild`: Currently displayed content item
- `expandedChapter`: Currently expanded chapter in navigation

## Pedagogical Purpose

The course structure is designed to provide a default linear pathway, while still supporting freeform navigation. Students should see:

1. **Clear Organization**: Chapters break content into manageable sections
2. **Navigation**: Learners can easily find and revisit content
3. **Progress Awareness**: Visible structure shows learning journey
4. **Modular Design**: Authors can organize content logically

Open edX courses were designed to allow students to self-navigate - advanced students could skip ahead and only do problems on sections which are review, while students with gaps could use many aids and revisit content.

## Common Use Cases

### Multi-Unit Course

```olx:code
<Course title="Learning Science 101">
  <Chapter title="Unit 1: Testing Effect" id="unit1">
    <Sequential>...</Sequential>
  </Chapter>
  <Chapter title="Unit 2: Spacing Effect" id="unit2">
    <Sequential>...</Sequential>
  </Chapter>
</Course>
```

### Tutorial Series

```olx:code
<Course title="Evidence-Based Teaching">
  <Chapter title="Active Learning" id="active">
    <Vertical>...</Vertical>
  </Chapter>
  <Chapter title="Formative Assessment" id="formative">
    <Vertical>...</Vertical>
  </Chapter>
</Course>
```

## Related Blocks
- **Sequential**: Step-by-step progression within chapters
- **Vertical**: Simple vertical layout for content

