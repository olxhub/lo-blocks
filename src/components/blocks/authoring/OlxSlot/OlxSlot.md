# OlxSlot

A slot that receives OLX and renders it as live, interactive content. Like TextSlot, but for full OLX instead of plain text.

## Overview

OlxSlot bridges dynamic content generation and the OLX rendering pipeline. It takes an OLX string -- from an LLM, from a student typing in a TextArea, or from any other source -- and renders it as fully interactive blocks.

Two modes of operation:

1. **Own value** (LLMAction target): LLMAction writes OLX to the slot's `value` field
2. **Reactive target**: Reads OLX from another component's `value` field with debouncing

## Basic Usage: Student Authoring

```olx:playground
<Vertical id="basic_olxslot">
  <Markdown>Type OLX below to see it rendered:</Markdown>
  <TextArea id="my_olx" placeholder="&lt;Markdown&gt;Hello!&lt;/Markdown&gt;" />
  <OlxSlot target="my_olx" id="olx_preview" />
</Vertical>
```

## LLM-Generated OLX

Use with LLMAction to have an LLM generate interactive content:

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

OlxSlot works with IntakeGate -- the gate watches the slot's `value` field:

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
| `target` | No | | ID of component to read OLX from reactively |
| `debounce` | No | 150 | Debounce delay in ms (only used with `target`) |

## State Fields

| Field | Type | Description |
|-------|------|-------------|
| `value` | string | The OLX string to render |
| `state` | LLM_STATUS | Loading state from LLM |

## How It Works

OlxSlot uses the existing `RenderOLX` component internally. When the OLX string changes:

1. The string is debounced (in target mode, default 150ms)
2. The debounced string is validated with `parseOLX()`
3. If valid, `RenderOLX` renders it as interactive blocks
4. If invalid, the **last successful render** is kept and a subtle "Editing..." indicator appears

This means parse errors mid-typing don't blow away the preview -- only successful parses update it. For LLMAction mode (no target), errors are shown directly since the LLM should produce valid OLX.

## Comparison

| Block | Renders | Use Case |
|-------|---------|----------|
| **TextSlot** | Plain text `<span>` | Inline text from LLM |
| **LLMFeedback** | Markdown/text/code | Styled feedback display |
| **OlxSlot** | Full interactive OLX | Dynamic block generation |

## Related Blocks

- **TextSlot**: Simpler alternative for plain text
- **LLMAction**: Writes to OlxSlot via `target` attribute
- **IntakeGate**: Watches OlxSlot to control content reveal
- **TextArea**: Source for student-authored OLX (via `target`)
