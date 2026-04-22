// packages/shared/lib/advance.ts
//
// Advance tree walker — depth-first advancement through the OLX DOM.
//
// Blocks declare advance/canAdvance on their blueprint to participate.
// The tree walker auto-walks children of transparent containers (blocks
// without advance), and delegates entirely to blocks that declare it
// (they own child traversal — see Sequential, which only tries its
// current child).
//
// Public API:
//   advance(nodeInfo)              — walk from root, advance deepest active child
//   advanceFrom(nodeInfo, state)   — advance within a subtree
//   canAdvanceFrom(nodeInfo, state) — read-only: can anything in the subtree advance?
//   registerAdvanceRoot(root)      — register a tree root (called by RenderOLX)
//   unregisterAdvanceRoot(root)    — unregister (cleanup on unmount)
//
// Global spacebar: auto-installed on first registerAdvanceRoot call.

import type { OlxDomNode, RuntimeProps } from '@/lib/types';

/* ----------------------------------------------------------------
 * Props reconstruction
 * ----------------------------------------------------------------
 * Build RuntimeProps from an OlxDomNode.  Same pattern as
 * actions.tsx:executeNodeActions and redux.ts:propsForNode, but
 * we already have the node — no lookup needed.
 */

function propsFromNode(node: OlxDomNode): RuntimeProps {
  const { olxJson, loBlock, runtime } = node;
  return {
    ...olxJson.attributes,
    id: olxJson.id,
    kids: olxJson.kids ?? [],
    loBlock,
    fields: loBlock.fields,
    locals: loBlock.locals,
    runtime,
    nodeInfo: node,
    idPrefix: runtime.idPrefix,
  } as RuntimeProps;
}

/* ----------------------------------------------------------------
 * Tree walkers
 * -------------------------------------------------------------- */

/**
 * Advance the deepest active child in the subtree rooted at `nodeInfo`.
 *
 * If the block declares `advance`, it owns the traversal — the system
 * calls it and does not auto-walk children.  The block can call
 * `advanceFrom` on specific children internally.
 *
 * If the block does NOT declare `advance`, the system walks its
 * `renderedKids` first-to-last looking for an advanceable descendant.
 */
export function advanceFrom(nodeInfo: OlxDomNode, state: any): boolean {
  const { loBlock } = nodeInfo;

  // Block owns traversal — delegate entirely
  if (loBlock?.advance) {
    return loBlock.advance(propsFromNode(nodeInfo), state);
  }

  // Transparent container — auto-walk children
  for (const child of Object.values(nodeInfo.renderedKids ?? {})) {
    if (advanceFrom(child, state)) return true;
  }
  return false;
}

/**
 * Read-only: can anything in the subtree advance?
 * Used for visual feedback (e.g. Sequential dims Next when child is active).
 */
export function canAdvanceFrom(nodeInfo: OlxDomNode, state: any): boolean {
  const { loBlock } = nodeInfo;

  if (loBlock?.canAdvance) {
    return loBlock.canAdvance(propsFromNode(nodeInfo), state);
  }

  for (const child of Object.values(nodeInfo.renderedKids ?? {})) {
    if (canAdvanceFrom(child, state)) return true;
  }
  return false;
}

/* ----------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------- */

/** Walk to root and advance the deepest active child in the whole tree. */
export function advance(nodeInfo: OlxDomNode): boolean {
  let root = nodeInfo;
  while (root.parent) root = root.parent;

  const state = nodeInfo.runtime.store.getState();
  return advanceFrom(root, state);
}

/* ----------------------------------------------------------------
 * Root registry + global spacebar
 * ----------------------------------------------------------------
 * Each RenderOLX registers its root node.  A single document-level
 * keydown listener tries each root first-to-last on spacebar.
 * The listener installs lazily on first registration.
 */

const advanceRoots: OlxDomNode[] = [];
let listenerInstalled = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (isTextInputFocused()) return;
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code !== 'Space' && e.key !== ' ') return;

  for (const root of advanceRoots) {
    const state = root.runtime.store.getState();
    if (advanceFrom(root, state)) {
      e.preventDefault();
      return;
    }
  }
}

function ensureGlobalListener() {
  if (listenerInstalled || typeof document === 'undefined') return;
  listenerInstalled = true;
  document.addEventListener('keydown', handleGlobalKeyDown);
}

export function registerAdvanceRoot(root: OlxDomNode) {
  advanceRoots.push(root);
  ensureGlobalListener();
}

export function unregisterAdvanceRoot(root: OlxDomNode) {
  const idx = advanceRoots.indexOf(root);
  if (idx >= 0) advanceRoots.splice(idx, 1);
}

/* ----------------------------------------------------------------
 * Text input detection (for spacebar guard)
 * -------------------------------------------------------------- */

const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number',
]);

/** True if the element accepts keyboard text input. */
export function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
