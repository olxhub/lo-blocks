# CodeInput

A CodeMirror-based code editor as an OLX block. Provides syntax highlighting for OLX, XML, and Markdown, with the value stored in Redux for other blocks to read.

## Overview

CodeInput wraps the CodeEditor component (used in Studio) as a first-class OLX block. Its value is stored in Redux like any input block, so other blocks can reference it. The primary use case is pairing with OlxSlot for live OLX authoring.

## Basic Usage

```olx:playground
<Vertical id="basic_code">
  <CodeInput id="editor" language="olx" height="150px" />
</Vertical>
```

## With OlxSlot (Live Preview)

The core authoring pattern -- edit OLX with syntax highlighting and see it rendered live:

```olx:playground
<Vertical id="live_edit">
  <CodeInput id="my_olx" language="olx" height="200px"
    placeholder="&lt;Markdown&gt;# Hello!&lt;/Markdown&gt;" />
  <OlxSlot target="my_olx" debounce="150" id="preview" />
</Vertical>
```

## Student Authoring (SBA)

Use in a training course where students build learning activities:

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
| `language` | No | `olx` | Syntax highlighting: `olx`, `xml`, `md`, `markdown` |
| `height` | No | `300px` | Editor height (any CSS value) |
| `theme` | No | `light` | Color theme: `light` or `dark` |
| `placeholder` | No | | Initial content shown in the editor |

## State Fields

| Field | Type | Description |
|-------|------|-------------|
| `value` | string | The current editor content |

## How It Works

CodeInput uses the same CodeEditor component as Studio, which provides:
- XML/OLX syntax highlighting via CodeMirror
- Line numbers and code folding
- Standard editor keybindings

The editor value is synced to Redux on every change via the standard `value` field, making it readable by any block through `componentFieldByName` or `fieldSelector`.

## Related Blocks

- **OlxSlot**: Renders OLX from CodeInput's value field
- **TextArea**: Simpler alternative without syntax highlighting
