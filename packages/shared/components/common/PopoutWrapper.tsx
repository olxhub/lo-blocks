// packages/shared/components/common/PopoutWrapper.tsx
//
// Universal pop-out wrapper for blocks. Renders an expand button over the block
// content and, when activated, portals the content into a full-viewport overlay.
//
// Supports two modes:
//   - "window": fixed overlay filling the viewport
//   - "fullscreen": same overlay + Fullscreen API (graceful fallback if denied)
//
// Used by render.tsx when a block has the popout="..." attribute.
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { useFieldState, commonFields } from '@/lib/state';
import type { StateKey, LoBlockRuntimeContext } from '@/lib/types';

type PopoutMode = 'window' | 'fullscreen';
type PopoutPosition = 'tl' | 'tr' | 'bl' | 'br';

interface ParsedPopout {
  mode: PopoutMode;
  position: PopoutPosition;
}

function parsePopout(value: string): ParsedPopout {
  const parts = value.split(':');
  return {
    mode: parts[0] as PopoutMode,
    position: (parts[1] as PopoutPosition) ?? 'tr',
  };
}

const POSITION_STYLES: Record<PopoutPosition, React.CSSProperties> = {
  tl: { top: 4, left: 4 },
  tr: { top: 4, right: 4 },
  bl: { bottom: 4, left: 4 },
  br: { bottom: 4, right: 4 },
};

interface PopoutWrapperProps {
  popout: string;
  stateKey: StateKey;
  runtime: LoBlockRuntimeContext;
  children: React.ReactNode;
}

export default function PopoutWrapper({ popout, stateKey, runtime, children }: PopoutWrapperProps) {
  const [expanded, setExpanded] = useFieldState(
    { runtime },
    commonFields.popoutExpanded,
    false,
    { stateKey }
  );
  const { mode, position } = parsePopout(popout);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const collapse = useCallback(() => {
    if (document.fullscreenElement === overlayRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setExpanded(false);
  }, [setExpanded]);

  const expand = useCallback(() => {
    setExpanded(true);
    if (mode === 'fullscreen') {
      // Request fullscreen after portal renders (next tick)
      setTimeout(() => {
        overlayRef.current?.requestFullscreen?.().catch(() => {
          // Fullscreen denied (e.g. Chromebook restrictions) — stay in window mode
        });
      }, 0);
    }
  }, [mode, setExpanded]);

  // Focus close button when expanded
  useEffect(() => {
    if (expanded) {
      // Wait for portal to render
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [expanded]);

  // Escape key dismissal
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        collapse();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expanded, collapse]);

  // Handle fullscreenchange (user may exit via browser UI)
  useEffect(() => {
    if (!expanded || mode !== 'fullscreen') return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setExpanded(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [expanded, mode, setExpanded]);

  if (!expanded) {
    return (
      <div style={{ position: 'relative' }}>
        {children}
        <button
          type="button"
          onClick={expand}
          aria-label="Expand block"
          style={{
            position: 'absolute',
            ...POSITION_STYLES[position],
            zIndex: 10,
            background: 'rgba(0, 0, 0, 0.4)',
            color: 'var(--lo-text-inverse)',
            border: 'none',
            borderRadius: 4,
            padding: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    );
  }

  // Expanded: placeholder in original position + portal overlay
  const overlay = (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--lo-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '8px 12px',
        borderBottom: '1px solid var(--lo-border)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          ref={closeButtonRef}
          onClick={collapse}
          aria-label="Close expanded view"
          style={{
            background: 'none',
            border: '1px solid var(--lo-border)',
            borderRadius: 4,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            color: 'var(--lo-text)',
          }}
        >
          <X size={16} /> Close
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={collapse}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') collapse(); }}
        aria-label="Restore block"
        style={{
          padding: 16,
          textAlign: 'center',
          color: 'var(--lo-text-muted)',
          background: 'var(--lo-bg-surface)',
          border: '1px dashed var(--lo-border)',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Content expanded — click to restore
      </div>
      {createPortal(overlay, document.body)}
    </>
  );
}
