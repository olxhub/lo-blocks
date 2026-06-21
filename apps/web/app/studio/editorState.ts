// apps/web/app/studio/editorState.ts
//
// Studio content state, keyed by a file's LofsRef. Thin wrappers over the
// fields/redux layer that fix the studio's conventions in one place:
//   - null baselineProps (studio isn't inside a block runtime yet)
//   - stateKey = the file's LofsRef ({source}://{path})
//
// Reactive (useStudioContent) for the editor render; synchronous get/set for
// callers that don't need to re-render (save, the LLM chat, dirty checks).
//
// The file's LofsRef serves as the opaque per-file content key. The state layer
// types stateKey as StateKey (the block-state-key brand), so we brand the ref
// through asStateKey here — the one boundary where a LofsRef becomes a content
// state key. (Studio-as-blocks will make CodeInput field-scoped and retire this.)
//
import { useFieldState, getReduxState, updateField } from '@/lib/state';
import { editorFields } from '@/lib/state/editorFields';
import { asStateKey } from '@/lib/types/id-grammar';
import type { LofsRef } from '@/lib/types';

/** Reactive content for one file. The editor subscribes; re-renders on change. */
export function useStudioContent(fileId: LofsRef): [string, (v: string) => void] {
  return useFieldState(null, editorFields.content, '', { stateKey: asStateKey(fileId) }) as
    [string, (v: string) => void];
}

/** Read a file's current content synchronously (no subscription). */
export function getStudioContent(fileId: LofsRef): string {
  return getReduxState(null, editorFields.content, '', { stateKey: asStateKey(fileId) });
}

/** Write a file's content synchronously (the editor's hook re-renders). */
export function setStudioContent(fileId: LofsRef, value: string): void {
  updateField(null, editorFields.content, value, { stateKey: asStateKey(fileId) });
}
