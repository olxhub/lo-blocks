// TextHighlightRenderer — renders text with colored highlight spans + summary strip.
//
// Reusable (not OLX-coupled). Takes plain text + HighlightEntry[] and renders
// highlighted spans using inline HSL background colors.
//
// Rendering uses a breakpoint algorithm adapted from WOTextHighlight
// (Writing Observer project): collect all span start/end offsets, sort,
// walk through slicing text at each breakpoint, apply colors for active
// highlights.

'use client';

import React, { useMemo } from 'react';
import { hslColor } from '@/lib/util/colorWheel';
import type { HighlightEntry } from '@/lib/highlight';

interface TextHighlightRendererProps {
  text: string;
  highlights: HighlightEntry[];
  showHighlight?: boolean;
  showSummary?: boolean;
}

// ─── Breakpoint rendering ───────────────────────────────────────────────────

function renderHighlightedText(
  text: string,
  highlights: HighlightEntry[],
): React.ReactNode[] {
  if (highlights.length === 0) return renderPlainText(text);

  // Collect all breakpoints
  const breakpoints = new Set<number>();
  breakpoints.add(0);
  breakpoints.add(text.length);

  for (const entry of highlights) {
    for (const span of entry.spans) {
      breakpoints.add(span.offset);
      breakpoints.add(span.offset + span.length);
    }
  }

  const sorted = [...breakpoints].sort((a, b) => a - b);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const slice = text.slice(start, end);
    if (!slice) continue;

    // Find all highlights active at this position
    const active: HighlightEntry[] = [];
    for (const entry of highlights) {
      for (const span of entry.spans) {
        if (span.offset <= start && span.offset + span.length >= end) {
          active.push(entry);
          break; // one match per entry is enough
        }
      }
    }

    if (active.length === 0) {
      elements.push(renderTextSegment(slice, `plain-${start}`));
    } else {
      // When highlights overlap, pick highest-saturation as the winner.
      // Lower-saturation highlights become invisible — acceptable for current
      // modes where overlaps are rare, but worth revisiting if modes with
      // frequent overlaps are added.
      const winner = active.reduce((a, b) => a.saturation > b.saturation ? a : b);
      const bg = hslColor(winner.hue, winner.saturation, winner.lightness);

      elements.push(
        <mark
          key={`hl-${start}`}
          className="lo-text-highlight__mark"
          style={{ backgroundColor: bg }}
          title={winner.label}
        >
          {renderNewlines(slice)}
        </mark>,
      );
    }
  }

  return elements;
}

/** Render a plain text segment, splitting on newlines. */
function renderTextSegment(text: string, keyPrefix: string): React.ReactNode {
  return <React.Fragment key={keyPrefix}>{renderNewlines(text)}</React.Fragment>;
}

/** Convert newlines to <br /> elements. */
function renderNewlines(text: string): React.ReactNode {
  const parts = text.split('\n');
  if (parts.length === 1) return text;

  return parts.map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < parts.length - 1 && <br />}
    </React.Fragment>
  ));
}

/** Render plain text with newline handling (no highlights). */
function renderPlainText(text: string): React.ReactNode[] {
  return [<React.Fragment key="plain">{renderNewlines(text)}</React.Fragment>];
}

// ─── Summary strip ──────────────────────────────────────────────────────────

function SummaryStrip({ highlights }: { highlights: HighlightEntry[] }) {
  // Sort by span count descending, take top 10
  const sorted = [...highlights]
    .sort((a, b) => b.spans.length - a.spans.length)
    .slice(0, 10);

  return (
    <div className="lo-text-highlight__summary">
      {sorted.map(entry => (
        <span key={entry.id} className="lo-text-highlight__chip">
          <span
            className="lo-text-highlight__chip-dot"
            style={{ backgroundColor: hslColor(entry.hue, entry.saturation, entry.lightness) }}
          />
          <span className="lo-text-highlight__chip-label">{entry.label}</span>
          <span className="lo-text-highlight__chip-count">{entry.spans.length}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TextHighlightRenderer({
  text,
  highlights,
  showHighlight = true,
  showSummary = true,
}: TextHighlightRendererProps) {
  const renderedText = useMemo(
    () => showHighlight ? renderHighlightedText(text, highlights) : null,
    [text, highlights, showHighlight],
  );

  return (
    <div className="lo-text-highlight">
      {renderedText && (
        <div className="lo-text-highlight__text">
          {renderedText}
        </div>
      )}
      {showSummary && highlights.length > 0 && (
        <SummaryStrip highlights={highlights} />
      )}
    </div>
  );
}
