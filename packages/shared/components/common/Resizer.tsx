// Resizer — drag handle for panel resizing.
//
// Emits total displacement (pixels from mousedown) on each mousemove.
// Consumer captures starting state in onResizeStart, then applies the
// total displacement directly — no accumulated deltas, no drift.
//
// Keyboard: arrow keys emit single-step resize sequences (start → resize → end).
// Supports horizontal (col-resize) and vertical (row-resize) directions.

'use client';

import { useRef, useEffect } from 'react';

export interface ResizerProps {
  /** Drag axis: 'horizontal' = left/right, 'vertical' = up/down. */
  direction?: 'horizontal' | 'vertical';
  /** Called once when drag begins. Capture starting state here. */
  onResizeStart?: () => void;
  /** Called on each mousemove with total pixel displacement from drag start. */
  onResize: (totalDelta: number) => void;
  /** Called once when drag ends. */
  onResizeEnd?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

export default function Resizer({
  direction = 'horizontal',
  onResize,
  onResizeStart,
  onResizeEnd,
  className = '',
}: ResizerProps) {
  const originPos = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    originPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    onResizeStart?.();

    const handleMouseMove = (e: MouseEvent) => {
      const current = direction === 'horizontal' ? e.clientX : e.clientY;
      onResize(current - originPos.current);
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
      onResizeEnd?.();
    };

    const handleMouseUp = () => cleanup();

    cleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Keyboard: each keypress is a complete resize sequence (start → resize → end)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    let delta = 0;
    if (direction === 'horizontal') {
      if (e.key === 'ArrowRight') delta = step;
      else if (e.key === 'ArrowLeft') delta = -step;
      else return;
    } else {
      if (e.key === 'ArrowDown') delta = step;
      else if (e.key === 'ArrowUp') delta = -step;
      else return;
    }
    e.preventDefault();
    onResizeStart?.();
    onResize(delta);
    onResizeEnd?.();
  };

  return (
    <div
      className={`lo-resizer lo-resizer--${direction} ${className}`}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      tabIndex={0}
    />
  );
}
