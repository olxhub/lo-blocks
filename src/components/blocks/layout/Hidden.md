# Hidden

**Advanced / System-Level Block**

Container that includes its children in the content tree without rendering them visually. The children exist, maintain state, and are accessible programmatically, but produce no visible output.

## Use Cases

### Content for LLM / AI Access

When an LLM scans a page to provide feedback or grading, it can access hidden content that students cannot see:

```olx:code
<Vertical id="essay_problem">
  <Markdown>Explain why retrieval practice is more effective than rereading for long-term retention.</Markdown>
  <TextArea id="essay" rows="6" />
  <Hidden>
    <Markdown id="rubric">
      Grading criteria:
      - Mentions the testing effect
      - Explains that retrieval strengthens memory traces
      - Notes that difficulty during practice improves retention
      - Cites research (Roediger & Karpicke, etc.)
    </Markdown>
  </Hidden>
  <LLMFeedback id="feedback" />
  <ActionButton label="Get Feedback">
    <LLMAction target="feedback">
      Evaluate this student essay using the hidden rubric.
      Essay: <Ref target="essay" />
      Rubric: <Ref target="rubric" />
    </LLMAction>
  </ActionButton>
</Vertical>
```

The LLM can read the rubric when generating feedback, but students never see it.

### Dynamic Visibility

Components that should always exist in the tree but only appear in certain contexts. For example, a problem in a dynamic navigation component that should be included in grade calculations even when not displayed.

### Inline Component Definitions

When defining reusable components inline (e.g., for use with UseDynamic), Hidden lets you keep definitions in the same file without displaying them where they're defined.

## Properties

- `id` (optional): Unique identifier

## Related Blocks

- **Noop**: Renders children without adding wrapper markup (children remain visible)
- **UseDynamic**: Can reference components defined inside Hidden

