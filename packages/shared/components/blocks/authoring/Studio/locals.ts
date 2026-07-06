// packages/shared/components/blocks/authoring/Studio/locals.ts
//
// Studio fields. The three page-level fields (source, file, tab) are
// system-scoped URL fields with bare names — that preserves the legacy
// studio URL contract exactly (?source=…&file=…&tab=…), which activity
// cards and external links depend on. Bare system-scoped names are
// global; Studio owns these page-level (collision caveat noted in
// urlFields.tsx's key convention).
//
// source/file are read (deep links) and popstate-resynced (back/forward)
// through the url-field machinery, but WRITTEN through setStudioLocation
// (_Studio.tsx) — correlated params must land in one history entry, so
// their per-field setters are bypassed (no urlPush here).

import * as state from '@/lib/state';
import { scopes } from '@/lib/state/scopes';

export const studioFields = state.fields([
  { name: 'source', scope: scopes.system, url: true },
  { name: 'file', scope: scopes.system, url: true },
  { name: 'tab', scope: scopes.system, url: true },
  // UI state (component-scoped, not URL-synced). Fields, not useState:
  // replay requires all UI state in the event stream. The only sanctioned
  // useState remaining is high-frequency drag state (editorRatio), pending
  // dynamic-field support in the field system.
  'studioSidebarCollapsed',
  'studioShowPreview',
  'studioPreviewLayout',
  'studioSaving',
  'studioNewFileOpen',
  'studioSourceMenuOpen',
  'studioPaletteOpen',
  'studioPaletteQuery',
  'studioPaletteIndex',
  // The block tag enclosing the editor cursor — drives the docs panel's
  // context-sensitive attribute reference. Written only when the tag
  // changes, not per cursor movement.
  'studioCursorTag',
]);
