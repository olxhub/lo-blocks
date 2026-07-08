// packages/shared/components/blocks/media/Transcript/_Transcript.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useRef } from 'react';
import { useFieldState } from '@/lib/state';
import { mediaFields, mediaStateKeyFor, mediaLocals } from '../mediaSync';
import { useVttCues } from '../vtt';

export default function Transcript(props: RuntimeProps) {
  const { src, target } = props as any;
  const stateKey = mediaStateKeyFor(props, target);

  // The one ticking subscription — kept in this leaf so playback
  // re-renders the cue list and nothing above it (encoded field: these
  // updates are local Redux only, never per-tick network).
  const [currentTime] = useFieldState(props, mediaFields.currentTime, 0, { stateKey });

  // Cues come from the module-level VTT cache (vtt.ts) — a static asset,
  // shared across instances and remounts. The active cue is DERIVED, not
  // stored: replay recomputes it from currentTime for free.
  const cues = useVttCues(src);
  const activeCueRef = useRef<HTMLButtonElement | null>(null);
  const activeCue = cues.findIndex((c) => currentTime >= c.start && currentTime < c.end);

  useEffect(() => {
    activeCueRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCue]);

  if (cues.length === 0) return null;

  return (
    <div className="max-h-96 overflow-y-auto border rounded p-2 text-sm">
      {cues.map((cue, i) => (
        <button
          key={i}
          ref={i === activeCue ? activeCueRef : undefined}
          onClick={() => mediaLocals.gotoTimestamp(props, cue.start, 'transcript', stateKey)}
          className={`block w-full text-left px-2 py-1 rounded hover:bg-muted ${
            i === activeCue ? 'bg-accent text-inverse' : ''
          }`}
        >
          {cue.text}
        </button>
      ))}
    </div>
  );
}
