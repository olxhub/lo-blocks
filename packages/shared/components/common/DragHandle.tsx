/**
 * HandleCommon - Multi-purpose handle component for drag-and-click interfaces
 * Supports various patterns: connect-the-dots, drag-the-box, and custom combinations
 */

type CursorType = 'grab' | 'pointer' | 'auto';
type MarkerType = 'gripper' | 'dots' | 'dot';
type PatternType = 'connect-the-dots' | 'drag-the-box' | 'custom';

interface HandleCommonProps {
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  title?: string;
  className?: string;

  // Explicit style controls
  pointer?: CursorType;      // 'grab' for draggable hand, 'pointer' for click hand
  marker?: MarkerType;        // 'gripper' for 6-dot grid, 'dots' for vertical dots
  pattern?: PatternType;      // Predefined combinations of pointer, marker, draggable

  // Legacy/special props
  variant?: MarkerType;       // Deprecated: use marker instead
  dataMatchingPointId?: string; // For line calculation in matching blocks
}

/**
 * Get pattern presets for common use cases
 */
function getPatternPreset(pattern: PatternType): { pointer: CursorType; marker: MarkerType; draggable: boolean } {
  switch (pattern) {
    case 'connect-the-dots':
      return { pointer: 'pointer', marker: 'dot', draggable: false };
    case 'drag-the-box':
      return { pointer: 'grab', marker: 'gripper', draggable: true };
    case 'custom':
    default:
      return { pointer: 'auto', marker: 'gripper', draggable: false };
  }
}

/**
 * Get Tailwind cursor classes for the pointer type
 */
function getCursorClass(pointer: CursorType, draggable: boolean): string {
  if (pointer === 'grab') {
    return 'cursor-grab active:cursor-grabbing';
  }
  if (pointer === 'pointer') {
    return 'cursor-pointer';
  }
  return '';
}

/**
 * Render the marker indicator (dot, dots, or gripper)
 */
function MarkerIcon({ marker }: { marker: MarkerType }) {
  if (marker === 'gripper') {
    return (
      // 2x3 grid of dots
      <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" className="mx-auto">
        <circle cx="3" cy="4" r="1.5" />
        <circle cx="9" cy="4" r="1.5" />
        <circle cx="3" cy="10" r="1.5" />
        <circle cx="9" cy="10" r="1.5" />
        <circle cx="3" cy="16" r="1.5" />
        <circle cx="9" cy="16" r="1.5" />
      </svg>
    );
  }

  if (marker === 'dot') {
    return (
      // Single dot (for connect-the-dots)
      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="mx-auto">
        <circle cx="4" cy="4" r="2" />
      </svg>
    );
  }

  return (
    // Vertical dots (for compact spaces)
    <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor" className="mx-auto">
      <circle cx="4" cy="2" r="1.5" />
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="4" cy="14" r="1.5" />
    </svg>
  );
}

export function HandleCommon({
  onDragStart,
  onDragEnd,
  onClick,
  draggable,
  title = 'Handle',
  className = '',
  pointer,
  marker,
  pattern,
  variant,
  dataMatchingPointId,
}: HandleCommonProps) {
  // Handle pattern preset
  let finalPattern: PatternType = pattern || 'custom';
  let finalPointer = pointer;
  let finalMarker = marker || variant;
  let finalDraggable = draggable;

  // If pattern is specified, use its presets
  if (pattern) {
    const preset = getPatternPreset(pattern);
    finalPointer ??= preset.pointer;
    finalMarker ??= preset.marker;
    finalDraggable ??= preset.draggable;
  }

  // Apply defaults
  finalPointer ??= 'auto';
  finalMarker ??= 'gripper';
  finalDraggable ??= true;

  const cursorClass = getCursorClass(finalPointer, finalDraggable);

  return (
    <div
      draggable={finalDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={title}
      data-matching-point={dataMatchingPointId ? '' : undefined}
      data-item-id={dataMatchingPointId}
      className={`
        handle-common flex flex-col justify-center items-center
        bg-gray-100 hover:bg-gray-200
        text-gray-400 hover:text-gray-600
        select-none transition-colors
        rounded-sm border border-gray-200
        ${cursorClass}
        ${className}
      `}
    >
      <MarkerIcon marker={finalMarker} />
    </div>
  );
}

/**
 * Backward compatibility export
 * @deprecated Use HandleCommon instead
 */
export function DragHandle(props: HandleCommonProps) {
  return <HandleCommon {...props} />;
}

// Type exports for convenience
export type { CursorType, MarkerType, PatternType };
export { type HandleCommonProps };
