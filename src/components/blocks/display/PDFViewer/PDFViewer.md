# PDFViewer

Displays PDF documents using the browser's built-in PDF viewer.

NOTE: In most cases, we recommend **against** using PDFs. These are sometimes helpful for historical documents, scientific papers, and similar, but most content is better served through Markdown or other components which are introspectable to LLMS, render well on mobile, and otherwise contain semantic rather than layout content.

## Usage

```olx:playground
<PDFViewer id="syllabus" src="/demos/handouts/montessori.pdf" />
```

## Properties

- `src` (required): PDF file path or URL
- `width` (optional): Viewer width as a CSS value, defaults to "100%"
- `height` (optional): Viewer height as a CSS value, defaults to "600px"

## Path Resolution

Same as Image:

- **Relative paths** (`handouts/syllabus.pdf`): Resolved relative to the OLX file during parsing
- **Content-absolute** (`/course/handouts/syllabus.pdf`): From content root
- **Platform assets** (`//static/guide.pdf`): From Next.js `public/` directory
- **External URLs** (`https://...`): Passed through directly
