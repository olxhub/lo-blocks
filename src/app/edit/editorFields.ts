// src/app/edit/editorFields.ts
import { fields } from '@/lib/state/redux';
import { scopes } from '@/lib/state/scopes';

export const editorFields = fields([
  { name: 'content', event: 'SET_CONTENT', scope: scopes.storage }
]);
