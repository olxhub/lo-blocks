// packages/shared/components/blocks/authoring/Studio/studioNs.ts
//
// Shared by StudioPage and EditorLLMChat (its own module so neither
// imports the other for a constant).

import { asContentNamespace } from '@/lib/types/id-grammar';

/** Synthetic namespace for studio scratch content — unsaved demo content,
 *  the LLM chat sidebar, and files the server can't resolve a namespace for.
 *  Real files preview under their server-resolved namespace (ReadResult.ns). */
export const STUDIO_NS = asContentNamespace('studio');
