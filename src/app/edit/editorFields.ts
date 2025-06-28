// src/app/edit/editorFields.ts
import { fields, scopes } from '@/lib/state';

export const editorFields = fields([
  { name: 'content', scope: scopes.storage },
  { name: 'parsed', scope: scopes.storage }
]);
