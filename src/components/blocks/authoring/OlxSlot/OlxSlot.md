# OlxSlot

**Experimental** -- we're still exploring how this block should work. The format may change in the future, so avoid using it in production courses for now.

Displays OLX as live, interactive content. The OLX can come from an AI-generated response, from a student typing in an editor, or from another block.

## Live Editing

Pair with a TextArea or CodeInput. Students type OLX, and it renders below as they type:

```olx:playground
<Vertical id="basic_olxslot">
  <Markdown>Type OLX below to see it rendered:</Markdown>
  <TextArea id="my_olx" placeholder="&lt;Markdown&gt;Hello!&lt;/Markdown&gt;" />
  <OlxSlot target="my_olx" id="olx_preview" />
</Vertical>
```

## AI-Generated Content

Use with LLMAction to generate interactive content on the fly:

```olx:playground
<Vertical id="llm_olxslot">
  <ActionButton label="Generate Greeting">
    <LLMAction target="greeting_slot">
Return OLX for a greeting. Use this format exactly:
&lt;Markdown&gt;
# Hello!
Welcome to the course.
&lt;/Markdown&gt;
Return ONLY the OLX, no markdown fences.
    </LLMAction>
  </ActionButton>
  <OlxSlot id="greeting_slot" />
</Vertical>
```

## With IntakeGate

OlxSlot works with IntakeGate to hide the input form once content is generated:

```olx:playground
<IntakeGate id="gate_olx" targets="gen_content">
  <Vertical>
    <Markdown>What should we teach?</Markdown>
    <TextArea id="teach_topic" placeholder="e.g., fractions" />
    <ActionButton label="Generate Lesson">
      <LLMAction target="gen_content">
Write a short lesson about: <Ref>teach_topic</Ref>
Return ONLY OLX using Markdown blocks. Example:
&lt;Markdown&gt;
## Title
Content here.
&lt;/Markdown&gt;
      </LLMAction>
    </ActionButton>
  </Vertical>
  <OlxSlot id="gen_content" />
</IntakeGate>
```

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | | Unique identifier |
| `target` | No | | ID of another block to read OLX from (e.g., a TextArea or CodeInput) |
| `debounce` | No | 150 | How long to wait (in ms) after the student stops typing before updating the preview. Only used with `target`. |

## How It Works

When paired with an editor (`target` mode):

1. The student types OLX in the editor
2. After a short pause (the `debounce` delay), the OLX is checked
3. If valid, the preview updates to show the new content
4. If there's an error, the last good preview stays visible with an "Editing..." indicator
5. Error details appear after a longer pause, so brief typos mid-typing don't flash errors

When used with LLMAction (no `target`), the generated content appears directly. Errors are shown immediately since the AI should produce valid OLX.

## Comparison

| Block | Shows | Best for |
|-------|-------|----------|
| **TextSlot** | Plain text | Short text from AI |
| **LLMFeedback** | Formatted text | Feedback and explanations from AI |
| **OlxSlot** | Full interactive content | AI-generated quizzes, activities, lessons |

## Related Blocks

- **TextSlot**: Simpler alternative for plain text
- **LLMAction**: Generates content for OlxSlot
- **IntakeGate**: Hides the input form after content is generated
- **CodeInput**: Editor with syntax highlighting (alternative to TextArea)
