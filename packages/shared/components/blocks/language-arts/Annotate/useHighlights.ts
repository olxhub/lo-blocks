// Annotate/useHighlights.ts
//
// DOM-level utilities for the Annotate block's in-passage text highlighting.
//
// Uses the CSS Custom Highlight API to paint colored backgrounds over text
// ranges without mutating React-managed DOM nodes. The API registers named
// Highlight objects (each wrapping a DOM Range), then CSS ::highlight() rules
// style them. This is the browser's native solution for "highlight arbitrary
// text spans across element boundaries."
//
// DESIGN: We store both character offsets AND quote text per annotation.
// Character offsets are the primary mechanism (they map directly to DOM Ranges
// via TreeWalker). The quote text is a fallback breadcrumb — if content edits
// or restyling shift offsets, a future "Option C" recovery path can search for
// the stored text near the stored offset to re-locate the highlight.
//
// TODO (DOM path metadata): For richer recovery, we could also store the path
// through the OLX DOM tree to the highlighted content (e.g., "block 'passage',
// child 2, text node 0, offset 14"). This would let us recover highlights even
// when the passage restructures across block boundaries. The field and data
// model are ready for this; the capture/recovery logic is future work.
//
// BROWSER SUPPORT: Chrome 105+, Edge 105+, Safari 17.2+, Firefox 132+.
// If CSS.highlights is undefined, useHighlights is a no-op — annotations
// still work, you just don't see colored backgrounds in the passage.
//

'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

// ---------------------------------------------------------------------------
// Core: map character offsets to a DOM Range
// ---------------------------------------------------------------------------

/**
 * Walk the text nodes of a container and create a DOM Range spanning
 * the given character offsets relative to the container's textContent.
 *
 * Returns null if the offsets fall outside the container's text.
 */
export function createRangeFromOffsets(
  container: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeLen = node.textContent?.length ?? 0;

    // Find the text node containing the start offset
    if (!startNode && charCount + nodeLen > start) {
      startNode = node;
      startOffset = start - charCount;
    }

    // Find the text node containing the end offset
    if (charCount + nodeLen >= end) {
      endNode = node;
      endOffset = end - charCount;
      break;
    }

    charCount += nodeLen;
  }

  if (!startNode || !endNode) return null;

  const range = new Range();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

// ---------------------------------------------------------------------------
// Hook: register CSS highlights for a set of annotations
// ---------------------------------------------------------------------------

export interface AnnotationRange {
  noteId: string;
  start: number;
  end: number;
}

/**
 * Register CSS Custom Highlights for each annotation in the passage.
 *
 * Runs as a useEffect after render — the passage DOM must exist before we
 * can create Ranges. Re-runs when annotations or activeNoteId change.
 *
 * Each annotation gets a highlight named `lo-ann-{instanceId}-{noteId}`.
 * The instanceId (block ID) ensures multiple Annotate blocks on the same
 * page don't collide.
 *
 * The corresponding ::highlight() CSS rules are injected by the component
 * via a <style> element — this hook only manages the Highlight objects.
 */
export function useHighlights(
  passageRef: RefObject<HTMLDivElement | null>,
  annotations: AnnotationRange[],
  instanceId: string,
): void {
  useEffect(() => {
    // Graceful degradation: CSS Custom Highlight API not available
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    const highlights = (CSS as any).highlights as Map<string, any>;

    const container = passageRef.current;
    if (!container) return;

    const registeredNames: string[] = [];

    for (const ann of annotations) {
      const name = `lo-ann-${instanceId}-${ann.noteId}`;
      const range = createRangeFromOffsets(container, ann.start, ann.end);
      if (range) {
        // Highlight is a browser global (not imported — it's a DOM API)
        const highlight = new (window as any).Highlight(range);
        highlights.set(name, highlight);
        registeredNames.push(name);
      }
    }

    // Cleanup: remove only the highlights we registered
    return () => {
      for (const name of registeredNames) {
        highlights.delete(name);
      }
    };
  }, [passageRef, annotations, instanceId]);
}

// ---------------------------------------------------------------------------
// Selection capture: get character offsets from the browser selection
// ---------------------------------------------------------------------------

export interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  /** Bounding rect of the selection, relative to the container */
  top: number;
  left: number;
  width: number;
}

/**
 * Capture the current browser text selection as character offsets relative
 * to a container element's textContent.
 *
 * Returns null if there's no selection, the selection is collapsed (cursor
 * without range), or the selection is outside the container.
 *
 * Offset calculation: create a range from the container's start to the
 * selection's start, then measure its toString().length. This correctly
 * counts characters across element boundaries (paragraphs, inline elements).
 */
export function getSelectionOffsets(
  container: HTMLElement,
): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  // Character offset: range from container start to selection start
  const preRange = document.createRange();
  preRange.setStart(container, 0);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + text.length;

  // Position for popup placement
  const rect = range.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return {
    text,
    start,
    end,
    top: rect.top - containerRect.top,
    left: rect.left - containerRect.left,
    width: rect.width,
  };
}

// ---------------------------------------------------------------------------
// Click detection: find which annotation (if any) was clicked
// ---------------------------------------------------------------------------

/**
 * Get the character offset at a click point within a container.
 *
 * Uses caretRangeFromPoint (Chrome/Safari) or caretPositionFromPoint (Firefox)
 * to find the text position under the cursor, then computes the character
 * offset relative to the container's textContent.
 *
 * Returns null if the click didn't land on text within the container.
 */
export function getCharOffsetAtPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  // Chrome / Safari
  let caretNode: Node | null = null;
  let caretOffset = 0;

  if ('caretRangeFromPoint' in document) {
    const range = (document as any).caretRangeFromPoint(clientX, clientY);
    if (!range) return null;
    caretNode = range.startContainer;
    caretOffset = range.startOffset;
  } else if ('caretPositionFromPoint' in document) {
    // Firefox
    const pos = (document as any).caretPositionFromPoint(clientX, clientY);
    if (!pos) return null;
    caretNode = pos.offsetNode;
    caretOffset = pos.offset;
  } else {
    return null;
  }

  if (!caretNode || !container.contains(caretNode)) return null;

  // Compute character offset relative to container
  const preRange = document.createRange();
  preRange.setStart(container, 0);
  preRange.setEnd(caretNode, caretOffset);
  return preRange.toString().length;
}

/**
 * Find which annotation (if any) contains the given character offset.
 */
export function findAnnotationAtOffset(
  annotations: AnnotationRange[],
  offset: number,
): AnnotationRange | null {
  return annotations.find(a => offset >= a.start && offset < a.end) ?? null;
}
