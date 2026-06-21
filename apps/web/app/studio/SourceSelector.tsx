// apps/web/app/studio/SourceSelector.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { LofsOrigin } from '@/lib/types';

/** One selectable content source (mirrors SourceInfo from contentSources.ts). */
export interface SourceOption {
  origin: LofsOrigin;
  label: string;
  writable: boolean;
}

/**
 * The working-repo selector: which source every Studio file op targets.
 *
 * Explicit, not inferred — picking a source re-scopes the file list, reads, and
 * saves to that one repo. Writable sources are listed first; read-only ones
 * below a divider, openable for reading/reuse but not saving.
 */
export default function SourceSelector({
  sources,
  value,
  onChange,
}: {
  sources: SourceOption[];
  value: LofsOrigin | undefined;
  onChange: (origin: LofsOrigin) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = sources.find(s => s.origin === value);
  const writable = sources.filter(s => s.writable);
  const readonly = sources.filter(s => !s.writable);

  const pick = (origin: LofsOrigin) => { onChange(origin); setOpen(false); };

  const item = (s: SourceOption) => (
    <button
      key={s.origin}
      className={`studio-source-item ${s.origin === value ? 'active' : ''}`}
      onClick={() => pick(s.origin)}
      title={s.origin}
    >
      <span>{s.label}</span>
      {!s.writable && <span className="ro-tag">read-only</span>}
    </button>
  );

  return (
    <div className="studio-source-selector" ref={ref}>
      <button
        className="studio-btn"
        onClick={() => setOpen(o => !o)}
        title="Choose the repo to edit in"
      >
        {current ? current.label : 'Select a repo…'} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="studio-source-menu" role="menu">
          {writable.map(item)}
          {readonly.length > 0 && <div className="studio-source-divider">read-only</div>}
          {readonly.map(item)}
        </div>
      )}
    </div>
  );
}
