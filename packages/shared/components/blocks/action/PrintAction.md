# PrintAction

Triggers the browser's print dialog when fired by an ActionButton, allowing
students to save their work as a PDF.

## Usage

```xml
<ActionButton label="Export as PDF">
  <PrintAction />
</ActionButton>
```

## Composing a submission with Markdown interpolation

Use `{{@block_id.value}}` in a Markdown block to pull values from other blocks
(TextArea, LLMFeedback, etc.) regardless of which Sequential step they are on:

```xml
<Markdown>
## My Submission

### Final Version
{{@postcard_final.value}}

### AI Feedback
{{@postcard_feedback.value}}

### Original Draft
{{@postcard_draft.value}}
</Markdown>

<ActionButton label="Export Submission">
  <PrintAction />
</ActionButton>
```

## Print CSS

A print stylesheet (`packages/shared/styles/print.css`) automatically hides
interactive chrome (navigation, buttons, hints) and cleans up typography for
print output.

## Known limitations

- **Sequential/Carousel**: only the current step renders. Use Markdown
  interpolation to compose content from earlier steps.
- **Embedded PDFs**: `<iframe>`-based PDFViewer content does not appear in
  print output.
- **Page breaks**: browser-controlled; a future iframe-based approach will
  give finer control.
