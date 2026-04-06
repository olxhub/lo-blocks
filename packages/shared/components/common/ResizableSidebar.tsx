// ResizableSidebar — shared sidebar wrapper with drag-to-resize and collapse.
//
// Width is managed outside React's render cycle. A ref tracks the current
// width (initialized from defaultWidth). During drag, both the ref and
// el.style.width are updated directly. The ref ensures React re-renders
// (from any cause) preserve the drag-resized width.
//
// Collapse is always controlled — parent owns the state.
//
// Renders a Fragment (sidebar + edge strip) to preserve parent flex layout.
// When collapsed, renders a thin rail with an expand chevron.

'use client';

import React, { useCallback, useId, useRef } from 'react';
import Resizer from './Resizer';
import NavArrow from './NavArrow';

export interface ResizableSidebarProps {
  children: React.ReactNode;
  /** Which side of the layout: 'start' (left in LTR) or 'end' (right). */
  side?: 'start' | 'end';

  // ── Width ──
  /** Initial width in pixels. Default: 320. */
  defaultWidth?: number;
  /** Minimum width during resize. Default: 200. */
  minWidth?: number;
  /** Maximum width during resize. Default: 600. */
  maxWidth?: number;

  // ── Collapse ──
  /** Whether the sidebar is collapsed. */
  collapsed: boolean;
  /** Called when the user clicks the collapse/expand toggle. */
  onCollapsedChange: (collapsed: boolean) => void;

  // ── Styling ──
  /** Apply chrome styling (.lo-chrome token bridge). */
  chrome?: boolean;
  /** Additional CSS class on the sidebar element. */
  className?: string;
  /** HTML tag to render. Default: 'aside'. */
  as?: 'aside' | 'div' | 'nav';
  /** Show resize handle. Default: true. */
  resizable?: boolean;
  /** Accessible label for the sidebar and its controls. Default: 'Sidebar'. */
  label?: string;
}

export default function ResizableSidebar({
  children,
  side = 'start',
  defaultWidth = 320,
  minWidth = 200,
  maxWidth = 600,
  collapsed,
  onCollapsedChange,
  chrome = false,
  className = '',
  as: Tag = 'aside',
  resizable = true,
  label = 'Sidebar',
}: ResizableSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const widthRef = useRef(defaultWidth);
  const startWidthRef = useRef(0);
  const sidebarId = useId();

  const toggleCollapse = useCallback(() => {
    onCollapsedChange(!collapsed);
  }, [collapsed, onCollapsedChange]);

  // ── Resize: snapshot width at drag start, apply total delta directly ──
  const handleResizeStart = useCallback(() => {
    const el = sidebarRef.current;
    if (!el) return;
    startWidthRef.current = el.getBoundingClientRect().width;
    el.classList.add('lo-sidebar--resizing');
  }, []);

  const handleResize = useCallback((totalDelta: number) => {
    const el = sidebarRef.current;
    if (!el) return;
    const adjusted = side === 'end' ? -totalDelta : totalDelta;
    const clamped = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + adjusted));
    widthRef.current = clamped;
    el.style.width = `${clamped}px`;
  }, [side, minWidth, maxWidth]);

  const handleResizeEnd = useCallback(() => {
    const el = sidebarRef.current;
    if (!el) return;
    el.classList.remove('lo-sidebar--resizing');
  }, []);

  // ── Chevron direction (RTL-aware via NavArrow) ──
  // Expand points away from the rail (toward content); collapse points toward the edge.
  const expandDirection = side === 'start' ? 'forward' : 'back';
  const collapseDirection = side === 'start' ? 'back' : 'forward';

  // ── Collapsed rail ──
  if (collapsed) {
    return (
      <div className={`lo-sidebar-rail ${chrome ? 'lo-chrome' : ''}`} data-side={side}>
        <button
          className="lo-sidebar-rail__toggle"
          onClick={toggleCollapse}
          aria-controls={sidebarId}
          aria-expanded={false}
          aria-label={`Expand ${label}`}
        >
          <NavArrow direction={expandDirection} className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // ── Expanded sidebar ──
  const sidebar = (
    <Tag
      id={sidebarId}
      ref={sidebarRef as React.Ref<any>}
      className={`lo-sidebar ${chrome ? 'lo-chrome' : ''} ${className}`}
      style={{ width: widthRef.current }}
      data-side={side}
      aria-label={label}
    >
      {children}
    </Tag>
  );

  const edge = resizable ? (
    <div className="lo-sidebar-edge">
      <button
        className="lo-sidebar-edge__toggle"
        onClick={toggleCollapse}
        aria-controls={sidebarId}
        aria-expanded={true}
        aria-label={`Collapse ${label}`}
      >
        <NavArrow direction={collapseDirection} className="w-2.5 h-2.5" />
      </button>
      <Resizer
        direction="horizontal"
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
        ariaLabel={`Resize ${label}`}
      />
    </div>
  ) : null;

  return side === 'start'
    ? <>{sidebar}{edge}</>
    : <>{edge}{sidebar}</>;
}
