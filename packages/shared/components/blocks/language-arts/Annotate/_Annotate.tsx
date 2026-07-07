// packages/shared/components/blocks/language-arts/Annotate/_Annotate.tsx
//
// Text annotation component — students select text from a passage, creating
// highlighted quotes with a note-taking sidebar.
//
// Layout: passage (left, flex: 1) + annotation sidebar (right, ~300px).
//
// Highlighting uses the CSS Custom Highlight API to paint colored backgrounds
// over text ranges in the rendered passage without mutating React-managed DOM.
// See useHighlights.ts for the DOM-level plumbing.
//
// Each annotation stores: quote text, character offsets (start/end), and
// (for the default editor) a note value. Custom editors manage their own
// state through scoped props.
//
// UX reference: annotation-component.jsx in the project root is a standalone
// mockup of the target UX. This implementation adapts it to the lo-blocks
// architecture (field system, scoped state, block rendering).
//
'use client';

import type { RuntimeProps, DefinitionRef } from '@/lib/types';

import React, { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useFieldState, useSet, useNextId, updateField } from '@/lib/state';
import { extendIdPrefix, scopeMarker, parseDefinitionRef, scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import { useKids, useBlock } from '@/lib/render';
import { assertKidArray } from '@/lib/util/kids';
import { groupHue, themeColors } from '@/lib/util/colorWheel';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { fields as annotateFields } from './Annotate';
import {
  useHighlights,
  createRangeFromOffsets,
  getSelectionOffsets,
  getCharOffsetAtPoint,
  findAnnotationAtOffset,
} from './useHighlights';
import type { AnnotationRange } from './useHighlights';

// ---------------------------------------------------------------------------
// Scoped props: each annotation gets its own Redux key namespace
// ---------------------------------------------------------------------------

/**
 * Build scoped props for an annotation. Sets idPrefix at both the top level
 * (where scopedStateKeyForBlock reads it) and on runtime (where child blocks read it).
 *
 * For noteId "2" on block "annotate_demo", the Redux key becomes
 * "annotate_demo:#2" — and fields like `quote` store under
 * "annotate_demo:#2:quote".
 */
function scopedNoteProps(props: RuntimeProps, noteId: string): RuntimeProps {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(noteId)]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

// ---------------------------------------------------------------------------
// Colors: golden ratio hue assignment per annotation
// ---------------------------------------------------------------------------

/**
 * Color set for one annotation — hue from golden ratio, saturation/lightness
 * adapted to the current theme via color-mix().
 *
 * Uses sRGB mixing (not OKLCH) because OKLCH perceptual blending rotates hues
 * when mixing small amounts into tinted backgrounds, making different
 * annotations look the same color. sRGB preserves hue identity.
 *
 * Each background/border color blends the annotation's hue into a semantic
 * token (--lo-bg, --lo-bg-surface, --lo-border). Light bg → light tint,
 * dark bg → dark tint, warm bg → warm tint. Automatic.
 */
function noteColors(noteId: string) {
  const hue = groupHue(parseInt(noteId, 10) || 0);
  const tc = themeColors(hue);
  return {
    highlight:       tc.tint,
    highlightActive: tc.tintStrong,
    accent:          tc.accent,
    accentLight:     `color-mix(in srgb, hsl(${hue} 80% 60%) 18%, var(--lo-bg-surface))`,
    cardBorder:      tc.border,
    cardShadow:      tc.shadow,
    quoteBg:         tc.surface,
  };
}

// ---------------------------------------------------------------------------
// SelectionPopup: appears near text selection with "Annotate" button
// ---------------------------------------------------------------------------

function SelectionPopup({
  top,
  left,
  width,
  containerWidth,
  onAnnotate,
}: {
  top: number;
  left: number;
  width: number;
  containerWidth: number;
  onAnnotate: () => void;
}) {
  const popupWidth = 140;
  const clampedLeft = Math.max(
    0,
    Math.min(left + width / 2 - popupWidth / 2, containerWidth - popupWidth - 8),
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: top - 44,
        left: clampedLeft,
        zIndex: 100,
      }}
    >
      {/* preventDefault on mouseDown keeps the browser text selection alive
          so that the click handler fires while the popup is still mounted.
          stopPropagation on mouseUp prevents the passage's handleMouseUp from
          re-running (which would re-derive the selection). */}
      <div className="rounded-md px-2 py-1 shadow-lg flex items-center gap-1" style={{ background: 'var(--lo-chrome)', color: 'var(--lo-chrome-text)' }}>
        <button
          onClick={onAnnotate}
          onMouseDown={(e) => e.preventDefault()}
          onMouseUp={(e) => e.stopPropagation()}
          className="text-xs font-semibold px-3 py-1.5 rounded hover:opacity-80 flex items-center gap-1.5 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Annotate
        </button>
      </div>
      {/* Arrow pointing down to the selection */}
      <div
        className="mx-auto"
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid var(--lo-chrome)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DefaultEditor: built-in textarea with markdown view toggle
// ---------------------------------------------------------------------------

/**
 * Default per-annotation editor: a textarea for writing notes.
 *
 * When the note is active (selected), shows the textarea for editing.
 * When inactive, shows the saved text rendered as markdown (or plain text
 * if empty). This gives a clean read view while keeping editing accessible.
 */
function DefaultEditor({
  props,
  noteId,
  isActive,
}: {
  props: RuntimeProps;
  noteId: string;
  isActive: boolean;
}) {
  const scoped = scopedNoteProps(props, noteId);
  const [value, setValue] = useFieldState(scoped, annotateFields.value, '');

  if (isActive) {
    return (
      <textarea
        className="w-full border border-border rounded p-2 text-sm resize-y min-h-[3rem] bg-surface focus:border-accent focus:outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write your note..."
        rows={3}
      />
    );
  }

  // View mode: render saved text (markdown if non-empty)
  if (!value) return null;
  // TODO: The --lo-space-lg override is a hack to zero the <p> margin-bottom
  // from .rendered-markdown. The right fix is to change rendered-markdown's
  // CSS to use margin-top only (not margin-bottom) for paragraph spacing —
  // adjacent margins collapse naturally, and trailing margins disappear.
  return (
    <div className="text-sm text-secondary leading-relaxed prose prose-sm max-w-none" style={{ '--lo-space-lg': '0px' } as React.CSSProperties}>
      <RenderMarkdown ns={props.runtime.ns}>{value}</RenderMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomEditor: render a referenced block as the per-annotation editor
// ---------------------------------------------------------------------------

/**
 * Custom editor: renders a block referenced by ID, scoped per annotation.
 *
 * The referenced block (e.g., a Vertical containing TextArea + MCQ)
 * manages its own state. Scoped props ensure each annotation gets
 * independent field state.
 */
function CustomEditor({
  props,
  noteId,
  editorId,
}: {
  props: RuntimeProps;
  noteId: string;
  editorId: string;
}) {
  const scoped = scopedNoteProps(props, noteId);
  const stateKey = scopedStateKeyForBlock({ ...scoped, id: parseDefinitionRef(editorId) });
  const { block } = useBlock(scoped, stateKey);
  return <>{block}</>;
}

// ---------------------------------------------------------------------------
// EditorSlot: renders editor with spacing, or nothing if editor is empty
// ---------------------------------------------------------------------------

/**
 * Wrapper that adds spacing between quote and editor only when the editor
 * has content. DefaultEditor returns null when inactive with no saved text,
 * so this avoids an empty div with margin creating whitespace.
 */
function EditorSlot({
  props,
  noteId,
  isActive,
  editorMode,
}: {
  props: RuntimeProps;
  noteId: string;
  isActive: boolean;
  editorMode: string;
}) {
  const isCustom = editorMode !== 'textarea' && editorMode;
  // Custom editors always render (they manage their own empty state).
  // Default editor: check if it would render anything.
  const scoped = scopedNoteProps(props, noteId);
  const [value] = useFieldState(scoped, annotateFields.value, '');
  const hasContent = isActive || !!value || !!isCustom;

  if (!hasContent) return null;

  return (
    <div className="mt-2" onClick={isActive ? (e) => e.stopPropagation() : undefined}>
      {isCustom ? (
        <CustomEditor props={props} noteId={noteId} editorId={editorMode} />
      ) : (
        <DefaultEditor props={props} noteId={noteId} isActive={isActive} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteCard: single annotation in the sidebar
// ---------------------------------------------------------------------------

function NoteCard({
  props,
  noteId,
  isActive,
  editorMode,
  onActivate,
  onDelete,
}: {
  props: RuntimeProps;
  noteId: string;
  isActive: boolean;
  editorMode: 'textarea' | 'false' | string; // block ID or keyword
  onActivate: () => void;
  onDelete: () => void;
}) {
  const scoped = scopedNoteProps(props, noteId);
  const [quote] = useFieldState(scoped, annotateFields.quote, '');
  const colors = noteColors(noteId);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onActivate(); }}
      className="relative border rounded-lg p-3.5 cursor-pointer transition-all"
      style={{
        background: isActive ? colors.accentLight : 'var(--lo-bg-surface)',
        borderColor: isActive ? colors.accent : colors.cardBorder,
        boxShadow: `0 1px 3px ${colors.cardShadow}`,
      }}
    >
      {/* Quoted text with colored left border and faint tinted background */}
      <div
        className="italic text-sm text-dimmed pl-2.5 pr-2 py-1.5 rounded overflow-hidden"
        style={{
          borderLeft: `3px solid ${colors.accent}`,
          background: colors.quoteBg,
          maxHeight: '3.5em',
          textOverflow: 'ellipsis',
        }}
      >
        &ldquo;{quote}&rdquo;
      </div>

      {/* Editor section — stopPropagation prevents clicks inside the editor
          from toggling the card's active state via onActivate.
          mt-2 creates spacing between quote and editor only when editor renders. */}
      {editorMode !== 'false' && (
        <EditorSlot props={props} noteId={noteId} isActive={isActive} editorMode={editorMode} />
      )}

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2.5 right-2.5 text-dimmed hover:text-error p-0.5 transition-colors"
        aria-label="Remove annotation"
        title="Remove annotation"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Annotate component
// ---------------------------------------------------------------------------

export default function Annotate(props: RuntimeProps) {
  assertKidArray(props.kids);
  const { fields, id } = props;

  // Editor mode from attribute: "textarea" (default), "false", or block ID
  const editorMode = props.editor || 'textarea';

  // ── Core state ──
  const notes = useSet(props, fields.notes);
  const nextId = useNextId(props, fields.noteIds);
  const [activeNote, setActiveNote] = useFieldState(props, fields.activeNote, '');
  const [pendingQuote, setPendingQuote] = useFieldState(props, fields.pendingQuote, '');
  const [pendingStart, setPendingStart] = useFieldState(props, fields.pendingStart, '');
  const [pendingEnd, setPendingEnd] = useFieldState(props, fields.pendingEnd, '');

  // ── Passage rendering ──
  const { kids } = useKids(props);
  const passageRef = useRef<HTMLDivElement>(null);

  // ── Collect annotation ranges for highlighting ──
  // Read each annotation's offsets from scoped state. We need these both
  // for the CSS highlights and for sorting the sidebar cards.
  const sortedNoteIds = [...notes.values].sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  // ── CSS Custom Highlight API ──
  // Build annotation ranges from sorted note IDs. The actual offset values
  // are read by NoteCard sub-components via useFieldState; here we read them
  // at the parent level too for the highlight hook and click detection.
  //
  // Note: this creates a useFieldState call per annotation. The number of
  // annotations is stable (hook count doesn't change mid-render because
  // we sort and iterate a fixed list). New annotations trigger a re-render
  // with the updated list.
  //
  // IMPORTANT: We cannot call hooks in a loop with a dynamic count.
  // Instead, we subscribe to the full component state at the parent level
  // and read offsets from Redux directly.
  const annotationRanges = useAnnotationRanges(props, sortedNoteIds);

  useHighlights(passageRef, annotationRanges, id);

  // ── Generate ::highlight() CSS rules ──
  const highlightStyles = sortedNoteIds.map((noteId) => {
    const colors = noteColors(noteId);
    const isActive = noteId === activeNote;
    const bg = isActive ? colors.highlightActive : colors.highlight;
    const name = `lo-ann-${id}-${noteId}`;
    return `::highlight(${name}) { background-color: ${bg}; }`;
  }).join('\n');

  // ── Selection handling ──
  const handleMouseUp = useCallback(() => {
    const container = passageRef.current;
    if (!container) return;

    // Small delay lets the browser finalize the selection
    setTimeout(() => {
      const info = getSelectionOffsets(container);
      if (info) {
        setPendingQuote(info.text);
        setPendingStart(String(info.start));
        setPendingEnd(String(info.end));
      } else {
        setPendingQuote('');
        setPendingStart('');
        setPendingEnd('');
      }
    }, 10);
  }, [setPendingQuote, setPendingStart, setPendingEnd]);

  // ── Click on highlighted text → activate that annotation ──
  const handlePassageClick = useCallback((e: React.MouseEvent) => {
    const container = passageRef.current;
    if (!container) return;

    const offset = getCharOffsetAtPoint(container, e.clientX, e.clientY);
    if (offset === null) return;

    const match = findAnnotationAtOffset(annotationRanges, offset);
    if (match) {
      e.stopPropagation(); // don't let the container's deactivation handler fire
      setActiveNote(match.noteId === activeNote ? '' : match.noteId);
    }
  }, [annotationRanges, activeNote, setActiveNote]);

  // ── Save annotation ──
  const saveAnnotation = useCallback(() => {
    if (!pendingQuote) return;

    const noteId = nextId();
    notes.add(noteId);

    const scoped = scopedNoteProps(props, noteId);
    updateField(scoped, annotateFields.quote, pendingQuote);
    updateField(scoped, annotateFields.start, pendingStart);
    updateField(scoped, annotateFields.end, pendingEnd);

    setActiveNote(noteId);
    setPendingQuote('');
    setPendingStart('');
    setPendingEnd('');
    window.getSelection()?.removeAllRanges();
  }, [pendingQuote, pendingStart, pendingEnd, nextId, notes, props, setActiveNote, setPendingQuote, setPendingStart, setPendingEnd]);

  // ── Delete annotation ──
  const handleDelete = useCallback((noteId: string) => {
    notes.del(noteId);
    if (activeNote === noteId) setActiveNote('');
  }, [notes, activeNote, setActiveNote]);

  // ── Sort notes by position in passage for sidebar display ──
  const sortedByPosition = [...annotationRanges].sort((a, b) => a.start - b.start);

  // ── Popup position: derived from stored offsets, not browser selection ──
  // Recompute the DOM Range from pendingStart/pendingEnd, then measure its
  // bounding rect. This is a pure function of (offsets + DOM layout) — no
  // ephemeral browser selection state needed.
  const popupInfo = (() => {
    if (!pendingQuote || !passageRef.current) return null;
    const start = parseInt(pendingStart, 10);
    const end = parseInt(pendingEnd, 10);
    if (!(end > start)) return null;
    const range = createRangeFromOffsets(passageRef.current, start, end);
    if (!range) return null;
    const rect = range.getBoundingClientRect();
    const containerRect = passageRef.current.getBoundingClientRect();
    return {
      top: rect.top - containerRect.top,
      left: rect.left - containerRect.left,
      width: rect.width,
    };
  })();

  return (
    <div className="annotate-container" onClick={() => setActiveNote('')}>
      <style>{highlightStyles}</style>

      <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>
        {/* ── Passage pane ── */}
        <div className="flex-1 min-w-0">
          <div
            ref={passageRef}
            className="passage p-6 border rounded-lg bg-surface relative"
            onMouseUp={handleMouseUp}
            onClick={handlePassageClick}
            style={{ userSelect: 'text', cursor: 'text' }}
          >
            {kids}

            {/* Selection popup */}
            {popupInfo && (
              <SelectionPopup
                top={popupInfo.top}
                left={popupInfo.left}
                width={popupInfo.width}
                containerWidth={passageRef.current?.offsetWidth ?? 600}
                onAnnotate={saveAnnotation}
              />
            )}
          </div>
        </div>

        {/* ── Annotation sidebar ── */}
        <div className="shrink-0" style={{ width: '300px' }}>
          <div className="sticky top-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-secondary">
                Annotations
              </h4>
              <span className="text-xs text-dimmed">
                {sortedByPosition.length} {sortedByPosition.length === 1 ? 'note' : 'notes'}
              </span>
            </div>

            {/* Note cards or empty state */}
            {sortedByPosition.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-dimmed">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <p className="text-sm text-dimmed leading-relaxed">
                  Select text in the passage to create your first annotation.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {sortedByPosition.map(({ noteId }) => (
                  <NoteCard
                    key={noteId}
                    props={props}
                    noteId={noteId}
                    isActive={noteId === activeNote}
                    editorMode={editorMode}
                    onActivate={() => setActiveNote(noteId === activeNote ? '' : noteId)}
                    onDelete={() => handleDelete(noteId)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Subscribe to annotation ranges via useSelector.
 *
 * We need the offsets at the parent level for two reasons:
 * 1. useHighlights needs all ranges to register CSS highlights
 * 2. Click detection needs all ranges to find which annotation was clicked
 *
 * Uses a single useSelector call (not one per annotation) to avoid
 * violating rules of hooks with a dynamic count. The selector extracts
 * start/end from each annotation's scoped Redux key. Custom equality
 * prevents re-renders when the actual offset values haven't changed.
 */
function useAnnotationRanges(props: RuntimeProps, noteIds: string[]): AnnotationRange[] {
  // Precompute the Redux keys outside the selector — they depend on props
  // and noteIds, not on Redux state.
  const stateKeys = noteIds.map((noteId) => ({
    noteId,
    key: scopedStateKeyForBlock(scopedNoteProps(props, noteId)),
  }));

  return useSelector(
    (state: any) => {
      const component = state?.application_state?.component ?? {};
      return stateKeys.map(({ noteId, key }) => {
        const s = component[key] ?? {};
        return {
          noteId,
          start: parseInt(s.start, 10) || 0,
          end: parseInt(s.end, 10) || 0,
        };
      }).filter((r) => r.end > r.start);
    },
    // Custom equality: same ranges by value (avoids new-array re-renders)
    (a: AnnotationRange[], b: AnnotationRange[]) =>
      a.length === b.length &&
      a.every((r, i) => r.noteId === b[i].noteId && r.start === b[i].start && r.end === b[i].end),
  );
}

