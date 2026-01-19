'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { isInputReadOnly, useGraderAnswer } from '@/lib/blocks';
import { extendIdPrefix } from '@/lib/blocks/idResolver';
import { HandleCommon } from '@/components/common/DragHandle';
import { fields } from './MatchingInput';
import type { MatchingArrangement, ItemPosition } from './types';
import './MatchingInput.css';

/**
 * Render a single matching item's content
 */
function MatchingItemContent({ props, kid, itemIdPrefix }) {
  const { kids } = useKids({ ...props, kids: [kid], idPrefix: itemIdPrefix });
  return <>{kids}</>;
}

/**
 * Generate a stable ID for an item if not present
 */
function ensureItemId(item: any, index: number): string {
  if (item?.id) return item.id;
  // Generate stable ID from content hash if no id attribute
  return `item_${index}`;
}

/**
 * Pair structure for matching items
 */
interface MatchingPair {
  leftId: string;
  rightId: string;
  leftKid: any;
  rightKid: any;
  pairIndex: number;
}

/**
 * Parse kids into left/right pairs
 * Alternating: index 0,2,4,... = left, index 1,3,5,... = right
 */
function parseMatchingPairs(kids: any[]): MatchingPair[] | null {
  if (!kids || kids.length < 2 || kids.length % 2 !== 0) {
    return null; // Invalid - need even number of kids
  }

  const pairs: MatchingPair[] = [];
  for (let i = 0; i < kids.length; i += 2) {
    const leftItem = kids[i];
    const rightItem = kids[i + 1];

    pairs.push({
      leftId: ensureItemId(leftItem, i),
      rightId: ensureItemId(rightItem, i + 1),
      leftKid: leftItem,
      rightKid: rightItem,
      pairIndex: pairs.length,
    });
  }

  return pairs;
}

/**
 * Shuffle array using Fisher-Yates
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Extract initialPosition from right-side items
 */
function extractDisplayPositions(pairs: any[]) {
  const positioned: { pairIndex: number; position: number }[] = [];
  const unpositioned: number[] = [];

  pairs.forEach((pair, pairIndex) => {
    const rightKid = pair.rightKid;
    const position = rightKid?.attributes?.initialPosition;

    if (position !== undefined) {
      const pos = parseInt(position, 10) - 1; // Convert to 0-based
      positioned.push({ pairIndex, position: pos });
    } else {
      unpositioned.push(pairIndex);
    }
  });

  return { positioned, unpositioned };
}

/**
 * Build initial right-side order (respects initialPosition, then shuffles remaining)
 */
function buildInitialRightOrder(pairs: any[], shuffle: boolean) {
  const { positioned, unpositioned } = extractDisplayPositions(pairs);
  const result = new Array(pairs.length);

  // Place items with initialPosition at specified positions
  positioned.forEach(({ pairIndex, position }) => {
    if (position >= 0 && position < pairs.length) {
      result[position] = pairIndex;
    }
  });

  // Find empty slots and fill with unpositioned items
  const emptySlots: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === undefined) {
      emptySlots.push(i);
    }
  }

  // Shuffle or keep order of unpositioned items
  const orderedUnpositioned = shuffle ? shuffleArray(unpositioned) : unpositioned;

  emptySlots.forEach((slot, i) => {
    if (i < orderedUnpositioned.length) {
      result[slot] = orderedUnpositioned[i];
    }
  });

  return result;
}

/**
 * Connection Lines Component - renders SVG lines between matched items
 */
function ConnectionLines({
  pairs,
  arrangement,
  rightOrder,
  correctArrangement,
  showAnswer,
  containerRef,
  selectedId,
  selectedSide,
  mousePos,
}: {
  pairs: MatchingPair[];
  arrangement: MatchingArrangement;
  rightOrder: number[];
  correctArrangement: MatchingArrangement;
  showAnswer: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  selectedSide: 'left' | 'right' | null;
  mousePos: { x: number; y: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, ItemPosition>>({});

  // Update positions on resize/scroll using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const updatePositions = () => {
      if (!containerRef.current) return;

      const newPositions: Record<string, ItemPosition> = {};
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Find all connection points within this container
      container.querySelectorAll('[data-matching-point]').forEach((el: HTMLElement) => {
        const itemId = el.getAttribute('data-item-id');
        if (itemId) {
          const rect = el.getBoundingClientRect();
          newPositions[itemId] = {
            itemId,
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top + rect.height / 2,
          };
        }
      });

      setPositions(newPositions);
    };

    // Initial update
    updatePositions();

    // Use ResizeObserver for robust reflow handling (browser only)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updatePositions());
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for scroll and window resize as fallback
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
    };
  }, [containerRef]);

  // Render lines
  const renderLines = (currentArrangement: MatchingArrangement, isCorrect: boolean, opacity: number): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];

    Object.entries(currentArrangement).forEach(([leftId, rightId]) => {
      const leftPos = positions[leftId];
      const rightPos = positions[rightId];

      if (leftPos && rightPos) {
        const key = `${leftId}-${rightId}-${isCorrect ? 'correct' : 'student'}`;
        const stroke = isCorrect ? '#22c55e' : '#3b82f6'; // green or blue
        const strokeWidth = isCorrect ? 6 : 2.5; // Correct lines thicker but more transparent

        lines.push(
          <line
            key={key}
            x1={leftPos.x}
            y1={leftPos.y}
            x2={rightPos.x}
            y2={rightPos.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={opacity}
            className="matching-line"
          />
        );
      }
    });

    return lines;
  };

  const svgLines: React.ReactNode[] = [];

  // Render correct arrangement first (underneath) if showAnswer
  if (showAnswer && correctArrangement && Object.keys(correctArrangement).length > 0) {
    svgLines.push(...renderLines(correctArrangement, true, 0.2));
  }

  // Render student arrangement (on top)
  if (Object.keys(arrangement).length > 0) {
    svgLines.push(...renderLines(arrangement, false, 0.9));
  }

  // Render preview line (follows mouse from selected point)
  if (selectedId && selectedSide && mousePos) {
    const selectedPos = positions[selectedId];
    if (selectedPos) {
      const previewKey = `preview-${selectedId}`;
      svgLines.push(
        <line
          key={previewKey}
          x1={selectedPos.x}
          y1={selectedPos.y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#a78bfa"
          strokeWidth="2"
          strokeDasharray="5,5"
          opacity="0.6"
          className="matching-preview-line"
        />
      );
    }
  }

  return (
    <svg
      ref={svgRef}
      className="matching-lines"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {svgLines}
    </svg>
  );
}

/**
 * Main MatchingInput component
 */
export default function _MatchingInput(props) {
  const { kids = [], shuffle = true, idPrefix } = props;

  // Parse pairs
  const pairs = parseMatchingPairs(kids);

  if (!pairs) {
    return (
      <DisplayError
        props={props}
        name="MatchingInput Error"
        message="MatchingInput requires an even number of children (left/right pairs)"
      />
    );
  }

  // State management
  const [arrangement, setArrangement] = useReduxState(props, fields.arrangement, {});
  const [rightOrder, setRightOrder] = useState(() => buildInitialRightOrder(pairs, shuffle));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSide, setDraggedSide] = useState<'left' | 'right' | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const readOnly = isInputReadOnly(props);
  const { showAnswer } = useGraderAnswer(props);

  const containerRef = useRef<HTMLDivElement>(null);

  // Track mouse movement for preview lines
  useEffect(() => {
    if (!containerRef.current || !selectedId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const handleMouseLeave = () => {
      setMousePos(null);
    };

    containerRef.current.addEventListener('mousemove', handleMouseMove);
    containerRef.current.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      containerRef.current?.removeEventListener('mousemove', handleMouseMove);
      containerRef.current?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [selectedId]);

  // Build correct arrangement (odd indices match with their right neighbors)
  const correctArrangement: MatchingArrangement = {};
  pairs.forEach((pair) => {
    correctArrangement[pair.leftId] = pair.rightId;
  });

  // Handle connection point click (left or right)
  const handleConnectionPointClick = (itemId: string, side: 'left' | 'right') => {
    if (readOnly) return;

    // If clicking the same item, deselect
    if (selectedId === itemId && selectedSide === side) {
      setSelectedId(null);
      setSelectedSide(null);
      return;
    }

    // If something already selected
    if (selectedId !== null && selectedSide !== null) {
      // If same side, just switch selection
      if (selectedSide === side) {
        setSelectedId(itemId);
        return;
      }

      // Different side - create connection
      const leftId = selectedSide === 'left' ? selectedId : itemId;
      const rightId = selectedSide === 'left' ? itemId : selectedId;

      const newArrangement = { ...arrangement };
      newArrangement[leftId] = rightId;
      setArrangement(newArrangement);

      // Clear selection
      setSelectedId(null);
      setSelectedSide(null);
      return;
    }

    // Nothing selected yet - select this item
    setSelectedId(itemId);
    setSelectedSide(side);
  };

  // Handle drag start
  const handleDragStart = (itemId: string, side: 'left' | 'right') => {
    if (readOnly) return;
    setDraggedId(itemId);
    setDraggedSide(side);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'link';
  };

  // Handle drop
  const handleDrop = (targetId: string, targetSide: 'left' | 'right') => {
    if (readOnly || !draggedId || !draggedSide) return;

    // Can't drop on same side
    if (draggedSide === targetSide) {
      setDraggedId(null);
      setDraggedSide(null);
      return;
    }

    // Create connection
    const leftId = draggedSide === 'left' ? draggedId : targetId;
    const rightId = draggedSide === 'left' ? targetId : draggedId;

    const newArrangement = { ...arrangement };
    newArrangement[leftId] = rightId;
    setArrangement(newArrangement);

    setDraggedId(null);
    setDraggedSide(null);
  };

  // Disconnect a matching
  const handleDisconnect = (leftId: string) => {
    if (readOnly) return;
    const newArrangement = { ...arrangement };
    delete newArrangement[leftId];
    setArrangement(newArrangement);
    setSelectedId(null);
    setSelectedSide(null);
  };

  return (
    <div
      ref={containerRef}
      className="matching-input relative p-4 border rounded-lg bg-gray-50"
      style={{ minHeight: '400px' }}
    >
      <ConnectionLines
        pairs={pairs}
        arrangement={arrangement}
        rightOrder={rightOrder}
        correctArrangement={correctArrangement}
        showAnswer={showAnswer}
        containerRef={containerRef}
        selectedId={selectedId}
        selectedSide={selectedSide}
        mousePos={mousePos}
      />

      <div className="matching-content flex gap-8 relative" style={{ zIndex: 5 }}>
        {/* Left column */}
        <div className="matching-left flex-1 space-y-3">
          {pairs.map((pair) => {
            const isSelected = selectedId === pair.leftId && selectedSide === 'left';
            const isDragged = draggedId === pair.leftId && draggedSide === 'left';
            const isMatched = arrangement[pair.leftId] !== undefined;

            return (
              <div
                key={pair.leftId}
                className={`matching-item matching-left-item relative p-3 border-2 rounded-md transition-all
                  ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
                  ${isMatched ? 'bg-green-50 border-green-300' : 'bg-white'}
                  ${readOnly ? 'bg-gray-100' : ''}
                  pr-12
                `}
              >
                <div className="flex items-center">
                  <div className="flex-1">
                    <MatchingItemContent
                      props={props}
                      kid={pair.leftKid}
                      itemIdPrefix={extendIdPrefix(props, ['left', pair.pairIndex]).idPrefix}
                    />
                  </div>
                </div>

                {/* Connection handle - RIGHT SIDE */}
                <HandleCommon
                  pattern="connect-the-dots"
                  title="Click to select and match"
                  dataMatchingPointId={pair.leftId}
                  className={`
                    absolute right-0 top-0 bottom-0 w-8
                    border-r-2 transition-all
                    ${isSelected ? 'bg-blue-200 border-blue-400' : isMatched ? 'bg-green-100 border-green-300' : 'border-gray-200'}
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(pair.leftId, 'left');
                  }}
                />

                {/* Disconnect button */}
                {isMatched && !readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect(pair.leftId);
                    }}
                    className="absolute top-1 right-2 px-1 py-0 text-xs bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition-all"
                    title="Remove connection"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Right column */}
        <div className="matching-right flex-1 space-y-3">
          {rightOrder.map((pairIndex) => {
            const pair = pairs[pairIndex];
            const rightId = pair.rightId;
            const isSelected = selectedId === rightId && selectedSide === 'right';
            const isDragged = draggedId === rightId && draggedSide === 'right';
            const isMatchedByStudent = Object.values(arrangement).includes(rightId);
            const canConnect = selectedId !== null && selectedSide !== null && selectedSide !== 'right';

            return (
              <div
                key={rightId}
                className={`matching-item matching-right-item relative p-3 border-2 rounded-md transition-all
                  ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
                  ${isMatchedByStudent ? 'bg-green-50 border-green-300' : 'bg-white'}
                  ${canConnect && !isMatchedByStudent ? 'hover:border-blue-400 hover:bg-blue-50' : ''}
                  ${readOnly ? 'bg-gray-100' : ''}
                  pl-12
                `}
                onDragOver={canConnect || draggedSide === 'left' ? handleDragOver : undefined}
                onDrop={() => handleDrop(rightId, 'right')}
              >
                <div className="flex items-center">
                  <div className="flex-1">
                    <MatchingItemContent
                      props={props}
                      kid={pair.rightKid}
                      itemIdPrefix={extendIdPrefix(props, ['right', pairIndex]).idPrefix}
                    />
                  </div>
                </div>

                {/* Connection handle - LEFT SIDE */}
                <HandleCommon
                  pattern="connect-the-dots"
                  title="Click to select and match"
                  dataMatchingPointId={rightId}
                  className={`
                    absolute left-0 top-0 bottom-0 w-8
                    border-l-2 transition-all
                    ${isSelected ? 'bg-blue-200 border-blue-400' : isMatchedByStudent ? 'bg-green-100 border-green-300' : 'border-gray-200'}
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(rightId, 'right');
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Status message */}
      <div className="mt-4 text-sm text-gray-600">
        {readOnly
          ? 'Submitted'
          : selectedId && selectedSide
            ? selectedSide === 'left'
              ? 'Click a definition on the right to connect'
              : 'Click an item on the left to connect'
            : 'Click dots to match'}
      </div>
    </div>
  );
}
