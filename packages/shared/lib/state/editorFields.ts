// src/lib/state/editorFields.ts
// Editor state field definitions - used by Studio, docs, and other editing contexts
import { fields, scopes } from '@/lib/state';

export const editorFields = fields([
  { name: 'content', scope: scopes.storage },
  { name: 'parsed', scope: scopes.storage },
  { name: 'editedContent', scope: scopes.storage }  // Used by docs page for live editing
]);
