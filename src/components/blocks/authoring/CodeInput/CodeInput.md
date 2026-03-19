# CodeInput

**Experimental** -- we're still exploring how this block should work. The format may change in the future, so avoid using it in production courses for now.

A code editor with syntax highlighting. Useful for activities where students write or edit OLX, code, or structured text.

## Basic Usage

```olx:playground
<CodeInput id="editor" language="olx" height="150px" />
```

## Live Preview

Pair with OlxSlot to show a live preview of whatever the student types:

```olx:playground
<Vertical id="live_edit">
  <CodeInput id="my_olx" language="olx" height="200px">&lt;Markdown&gt;# Hello!&lt;/Markdown&gt;</CodeInput>
  <OlxSlot target="my_olx" debounce="150" id="preview" />
</Vertical>
```

## Student Authoring

Students can build their own learning activities:

```olx:playground
<Vertical id="sba_demo">
  <Markdown>
## Build a Quiz

Write OLX for a multiple choice question. Use CapaProblem, KeyGrader,
ChoiceInput, Key, and Distractor blocks.
  </Markdown>
  <CodeInput id="student_quiz" language="olx" height="250px" />
  <Markdown>### Your Quiz</Markdown>
  <OlxSlot target="student_quiz" debounce="1000" id="quiz_preview" />
</Vertical>
```

## Attributes

| Attribute | Required | Default | Description |
|-----------|----------|---------|-------------|
| `id` | Yes | | Unique identifier |
| `language` | No | `olx` | Syntax highlighting language (`olx`, `xml`, `md`, `markdown`, and others) |
| `height` | No | `300px` | Editor height (any CSS value) |
| `theme` | No | `light` | Color theme: `light` or `dark` |
| (children) | No | | Initial content shown in the editor |

## Related Blocks

- **OlxSlot**: Renders OLX from CodeInput as live interactive content
- **TextArea**: Simpler alternative without syntax highlighting
