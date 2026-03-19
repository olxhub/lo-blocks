# Image

Displays images.

## Usage

```olx:code
<Image id="diagram" src="path/to/image.png" alt="Diagram showing the testing effect" />
```

## Properties

- `src` (required): Image path or URL
- `alt` (optional): Alt text, defaults to "Content image"
- `width` (optional): Width in pixels, defaults to 400 (may be ignored depending on context)
- `height` (optional): Height in pixels, defaults to 300 (may be ignored depending on context)

## Path Resolution

- **Relative paths** (`images/photo.png`): Resolved relative to the OLX file during parsing
- **Content-absolute** (`/course/images/photo.png`): From content root
- **Platform assets** (`//static/logo.png`): From Next.js `public/` directory
- **External URLs** (`https://...`): Passed through directly

Images are copied to `public/content/` during content sync for production serving.

