# Implementation Backlog

This document lists incremental tasks to evolve the edit/preview system described in
[edit-preview-design.md](./edit-preview-design.md). Each step should keep the codebase working and
be small enough to implement in a single pull request.

## 1. Provider overlay
- [ ] Implement `overlayProviders` helper.
- [ ] Add `ReduxStorageProvider` and `NetworkStorageProvider` skeletons.
- [ ] Stack them in the preview page so unsaved edits override network content.

## 2. Preview parsing
- [ ] Update `PreviewPane` to pass the provider stack to `parseOLX`.
- [ ] Ensure `parseOLX` loads referenced files via the provider.

## 3. File type whitelist
- [ ] Relax `/api/file` checks to accept known extensions (include `.chatpeg`).
- [ ] Generate the list of allowed extensions from PEG grammars.

## 4. Preview target selection
- [ ] Add drop-down listing provenances that reference the current file.
- [ ] Parse the global `idMap` to determine possible parents.

## 5. Re-render on change
- [ ] Emit events from `ReduxStorageProvider` when content changes.
- [ ] Subscribe in the preview pane to trigger re-parsing.

## 6. Saving & provenance
- [ ] Propagate writes through the provider stack and append provenance info.
- [ ] Persist changes to the user's repo via the network provider.

## 7. Loading state
- [ ] Show a loading indicator while parsing or fetching files.
- [ ] Track pending requests in Redux so the UI knows when parsing completes.

These steps can be tackled sequentially or in parallel, but each should land in
working order with tests passing.
