// src/app/edit/editorFields.ts
import { fields, scopes } from '@/lib/state';

export const editorFields = fields([
  { name: 'content', scope: scopes.storage },
  { name: 'parsed', scope: scopes.storage },
  { name: 'editedContent', scope: scopes.storage }  // Used by docs page for live editing
]);
