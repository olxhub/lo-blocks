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
- `authors` (optional): Creator name(s) — string or list
- `hyperlink` (optional): URL(s) to the original work — string or list
- `license` (optional): One of: `CC0`, `CC BY`, `CC BY-SA`, `CC BY-NC`, `CC BY-NC-SA`, `CC BY-ND`, `CC BY-NC-ND`, `Public domain`, `Fair use`, `AGPL`, `GPL`

## Attribution

The `authors`, `hyperlink`, and `license` fields capture provenance for
licensed assets (e.g. images from Wikipedia). Long-term, attribution
belongs in a proper asset tracking system with git-like provenance
tracking rather than on individual image tags. But by recording it now
as we build out courses and resources, we have the information available
when that system is ready.

## Path Resolution

- **Relative paths** (`images/photo.png`): Resolved relative to the OLX file during parsing
- **Content-absolute** (`/course/images/photo.png`): From content root
- **Platform assets** (`//static/logo.png`): From Next.js `public/` directory
- **External URLs** (`https://...`): Passed through directly

Images are copied to `public/content/` during content sync for production serving.

