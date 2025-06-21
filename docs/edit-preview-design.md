# Edit Page & Live Preview Design Options

This document outlines approaches to fix the broken edit page and support
editing OLX and auxiliary files (e.g. `.chatpeg`) with a live preview.

## Current state

The preview pane parses the edited file with `parseOLX` and merges the
result with the global `idMap` fetched from `/api/content/all`.
`parseOLX` now supports an optional storage provider and asynchronous
operations, but the edit page still calls it without a provider:

```ts
candidate = await parseOLX(content, prov);
```
(see `src/app/edit/[[...path]]/page.tsx` lines 206–211)

This means blocks like `<Chat src="sba.chatpeg"/>` cannot load their
external content.  The `/api/file` route also rejects non‐XML files,
blocking edits of `.chatpeg` scripts:

```ts
if (!full.endsWith('.xml') && !full.endsWith('.olx')) {
  throw new Error('Invalid file type');
}
```
(from `src/app/api/file/route.js` lines 23–26)

## Goals
- Allow authors to edit XML/OLX files and related assets (`.chatpeg`, etc.)
- Show a preview that reflects unsaved edits across all referenced files
- Keep the interface responsive (re-render on change)

## Proposed building blocks

### 1. Storage provider overlay
The editor runs in the browser while `FileStorageProvider` only exists on
the server.  We therefore introduce a `NetworkStorageProvider` that
proxies read/write requests to `/api/file`.  In memory edits live in a
`ReduxStorageProvider`.  These providers are stacked using an
`overlayProviders` helper so each call checks the overlays in order.

```ts
const provider = overlayProviders(
  new ReduxStorageProvider(reduxState),
  new NetworkStorageProvider('/api/file')
);
```

The resulting provider implements the same interface as `StorageProvider`:
- look up unsaved edits from Redux using the path as key
- fall back to the network (and ultimately the filesystem) when no
  override exists
- expose the usual `read`, `write` and `update` methods

With this stack `parseOLX` can load referenced sources from in-memory or
server storage transparently.

### 2. Passing the provider to the preview
`PreviewPane` should create a provider stack each time content or related
state changes:
```ts
const provider = overlayProviders(
  new ReduxStorageProvider(reduxState),
  new NetworkStorageProvider('/api/file')
);
const prov = path ? [`file://${path}`] : [];
const candidate = await parseOLX(content, prov, provider);
```
Updating this call ensures `<Chat src="..."/>` resolves correctly and
lets the preview use the latest unsaved edits.

### 3. Relax file type checks
Update `/api/file` to allow non‑XML text files such as `.chatpeg`.  This
lets the editor load and save auxiliary files.  A simple extension check
could whitelist `.chatpeg` while still blocking unknown types.

### 4. Choosing what to preview
There is often no one-to-one mapping between the file being edited and
what should render.  A `.chatpeg` file may be referenced in multiple OLX
files.  Two possible strategies:

1. **Explicit preview target** – the URL (or a drop-down) specifies both
the edit file and the OLX file to preview.  When editing an auxiliary
file the editor defaults to the first referencing OLX document.
2. **Automatic detection** – build a reverse index from the global
`idMap` to locate parents that use the current file.  If only one parent
is found, preview it automatically; otherwise prompt the user.

Both approaches rely on `parseOLX` with the overlaid provider stack so
preview always uses the latest in-memory content.

### 5. Triggering re-render
`ReduxStorageProvider` can emit a custom event or update Redux state
whenever a file changes.  The preview pane subscribes to these changes
(via a React hook) and re-runs `parseOLX` for the preview target.  This
keeps the UI responsive without polling.

### 6. Saving and provenance
Saving pushes content down the provider stack.  `ReduxStorageProvider`
stores the latest edits and exposes `write`/`update` that forward the
request to the next provider (here the network layer).  The server then
persists to the underlying filesystem or database.  Each provider adds a
`provenance` entry so the graph knows where a piece of content came from
(`redux:`, `network:`, `file:` etc.).  When the user hits "save" the
chain executes in order and updates the corresponding provenances.

### 7. Loading state
Parsing and network requests are asynchronous.  The preview pane should
display a loading indicator (or skeleton) while waiting for
`parseOLX` to resolve.  The provider can expose a simple `onStart`/`onEnd`
callback that increments a "pending" counter in Redux; when the counter is
non‑zero the UI shows a spinner so authors know the preview is still
processing.

## Recommendation
Start with the explicit preview target (#4 option 1) and the storage
provider overlay.  They introduce minimal complexity and unblock author
workflows.  Automatic parent detection and richer collaboration features
can be layered on later.

