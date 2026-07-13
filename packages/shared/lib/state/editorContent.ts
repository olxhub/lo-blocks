// packages/shared/lib/state/editorContent.ts
//
// Editable content state, keyed by a file's LofsRef — the redux working
// tree, v1. Ported from apps/web/app/studio/editorState.ts unchanged in
// mechanism; see that file's header for the LofsRef→StateKey boundary
// rationale. Under the settled storage model (git lake / redux working
// tree / CRDT documents) this module is the working-tree accessor; a
// CRDT-backed field type slots in behind the same three functions.
//
// Not Studio-specific: any surface that lets a user edit a file's text
// keys into this same buffer. Both Studio's file editor and BlockDoc's
// live example editing share it, so an edit persists across tab switches
// and reloads (docField, storage scope) for free.
//
//   - null baselineProps (studio isn't inside a block runtime yet)
//   - stateKey = the file's LofsRef ({source}://{path})
//
// Reactive (useStudioContent) for the editor render; synchronous get/set
// for callers that don't need to re-render (save, the LLM chat, dirty
// checks).

import { useFieldState, getField, getReduxState, updateField } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { asStateKey } from '@/lib/types/id-grammar';
import type { LofsRef } from '@/lib/types';

/** Reactive content for one file. The editor subscribes; re-renders on change. */
export function useStudioContent(fileId: LofsRef): [string, (v: string) => void] {
  return useFieldState(null, editorFields.content, '', { stateKey: asStateKey(fileId) }) as
    [string, (v: string) => void];
}

/** Read a file's current content synchronously (no subscription).
 *  getField, not getReduxState: content is a docField, so the raw redux
 *  value is an RgaDoc — the DECODED string is what save, the LLM tools,
 *  and dirty checks need. */
export function getStudioContent(fileId: LofsRef): string {
  return getField(null, editorFields.content, { fallback: '', stateKey: asStateKey(fileId) });
}

/** Whether the redux working tree already has a value for this file. */
export function hasStudioContent(fileId: LofsRef): boolean {
  const missing = Symbol('missing-studio-content');
  return getReduxState(null, editorFields.content, missing, { stateKey: asStateKey(fileId) }) !== missing;
}

/** Write a file's content synchronously (the editor's hook re-renders). */
export function setStudioContent(fileId: LofsRef, value: string): void {
  updateField(null, editorFields.content, value, { stateKey: asStateKey(fileId) });
}
