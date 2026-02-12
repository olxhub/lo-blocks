# CodeInput

**Experimental / Prototype** -- this block is exploratory and its API will likely change.

A CodeMirror editor as an OLX block. Provides syntax highlighting for OLX, XML, Markdown, and PEG content formats.

## Overview

Wraps the CodeEditor component as an OLX block. Value is stored in Redux so other blocks can read it (e.g., OlxSlot for live preview).

## Basic Usage

```olx:playground
<Vertical id="basic_code">
  <CodeInput id="editor" language="olx" height="150px" />
</Vertical>
```

## With OlxSlot (Live Preview)

Edit OLX with syntax highlighting and see it rendered live:

```olx:playground
<Vertical id="live_edit">
  <CodeInput id="my_olx" language="olx" height="200px">&lt;Markdown&gt;# Hello!&lt;/Markdown&gt;</CodeInput>
  <OlxSlot target="my_olx" debounce="150" id="preview" />
</Vertical>
```

## Example: Student Authoring

Prototype for a training course where students build learning activities:

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
| `language` | No | `olx` | Syntax highlighting: `olx`, `xml`, `md`, `markdown`, plus PEG content formats |
| `height` | No | `300px` | Editor height (any CSS value) |
| `theme` | No | `light` | Color theme: `light` or `dark` |
| (children) | No | | Initial content shown in the editor |

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
