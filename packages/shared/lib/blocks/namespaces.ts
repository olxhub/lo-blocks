// src/lib/blocks/namespaces.js
//
// Block namespaces - organizational system for grouping blocks by domain/author.
//
// Provides pre-configured block factories for different development contexts:
// - `core`: Stable, production-ready blocks for the core platform
// - `dev`: Development/experimental blocks that may change frequently
// - `test`: Blocks specifically designed for testing and development workflows,
//           often throw-away.
//
// Namespaces help prevent naming conflicts and allow different teams/contexts
// to develop blocks independently. Each namespace creates blocks with the same
// factory function but tagged with different organizational identifiers.
//
import { blocks } from './factory';

export const core = blocks('org.mitros.core');
export const dev = blocks('org.mitros.dev');
export const test = blocks('org.mitros.test');
