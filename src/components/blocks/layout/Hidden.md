# Hidden Block

**Advanced / System-Level Block**

## Overview

Hidden is a container that includes its children in the content tree without rendering them visually. The children exist, maintain state, and are accessible programmatically, but produce no visible output.

## Use Cases

### Content for LLM / AI Access

When an LLM scans a page to provide feedback or grading, it can access hidden content that students cannot see:

```xml
<Vertical id="essay_problem">
  <Markdown>Write an essay about climate change.</Markdown>
  <TextArea id="essay" />
  <Hidden>
    <Markdown id="rubric">
      Grading criteria:
      - Cites scientific sources
      - Addresses counterarguments
      - Clear thesis statement
    </Markdown>
  </Hidden>
</Vertical>
```

The LLM can read the rubric when generating feedback, but students never see it.

### Dynamic Visibility

Components that should always exist in the tree but only appear in certain contexts. For example, we might have a problem in a dynamic navigation component, but for purposes of calculating total grade, we'd like it in the OLX tree permanently.

### Inline Component Definitions

When defining reusable components inline (e.g., for use with UseDynamic), Hidden lets you keep definitions in the same file without displaying them where they're defined.

## Properties

- `id` (optional): Unique identifier

## Related Blocks

- **Noop**: Renders children without adding wrapper markup (children remain visible)
- **UseDynamic**: Can reference components defined inside Hidden
