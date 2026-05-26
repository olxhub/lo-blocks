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

## Loose Children

Blocks can be placed directly inside `<Course>` without wrapping them in a `<Chapter>`. These appear as flat items in the navigation sidebar, useful for introductions, conclusions, or short courses that don't need chapter grouping.

```olx:code
<Course title="Short Course">
  <Markdown id="intro" title="Introduction">Welcome!</Markdown>
  <Chapter title="Unit 1" id="ch1">
    <Sequential id="seq1" title="Lesson 1">...</Sequential>
  </Chapter>
  <Markdown id="conclusion" title="Wrap-up">Done!</Markdown>
</Course>
```

For a flat course with no chapters at all:

```olx:code
<Course title="Quick Tutorial">
  <Sequential id="s1" title="Step 1">...</Sequential>
  <Sequential id="s2" title="Step 2">...</Sequential>
</Course>
```

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

### Course with Introduction

```olx:code
<Course title="Evidence-Based Teaching">
  <Markdown id="intro" title="Welcome">Welcome to the course!</Markdown>
  <Chapter title="Active Learning" id="active">
    <Vertical>...</Vertical>
  </Chapter>
  <Chapter title="Formative Assessment" id="formative">
    <Vertical>...</Vertical>
  </Chapter>
</Course>
```

### Flat Course (No Chapters)

```olx:code
<Course title="Quick Tutorial">
  <Sequential id="s1" title="Step 1">...</Sequential>
  <Sequential id="s2" title="Step 2">...</Sequential>
  <Sequential id="s3" title="Step 3">...</Sequential>
</Course>
```

## Related Blocks
- **Sequential**: Step-by-step progression within chapters
- **Vertical**: Simple vertical layout for content
