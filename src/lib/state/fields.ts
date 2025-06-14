// src/lib/state/fields.ts
import { Scope } from './scopes';

export interface FieldSpec {
  type: 'field';
  name: string;
  event: string;
  scope: Scope;
}
