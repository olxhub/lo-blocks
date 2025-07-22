// src/lib/state/scopes.ts
import { enumdict } from '../util';

const _scopes = [
  'component',         // Per OLX ID
  'componentSetting',  // Per XML tag (e.g. video)
  'system',            // Global
  'storage'            // File storage (e.g. editor)
] as const;

export const scopes = enumdict(_scopes);
export type Scope = typeof _scopes[number];

// Thin helper so legacy code can keep string literals a bit longer if needed.
export function asScope(value: string): Scope {
  return value as Scope;
}
