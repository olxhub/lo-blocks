'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { isInputReadOnly, useGraderAnswer } from '@/lib/blocks';
import { extendIdPrefix } from '@/lib/blocks/idResolver';
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
}: {
  pairs: MatchingPair[];
  arrangement: MatchingArrangement;
  rightOrder: number[];
  correctArrangement: MatchingArrangement;
  showAnswer: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, ItemPosition>>({});

  // Update positions on resize/scroll using ResizeObserver
  useEffect(() => {
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

    // Use ResizeObserver for robust reflow handling
    const resizeObserver = new ResizeObserver(() => updatePositions());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for scroll and window resize as fallback
    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    return () => {
      resizeObserver.disconnect();
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

        lines.push(
          <line
            key={key}
            x1={leftPos.x}
            y1={leftPos.y}
            x2={rightPos.x}
            y2={rightPos.y}
            stroke={stroke}
            strokeWidth="2"
            opacity={opacity}
            className="matching-line"
          />
        );
      }
    });

    return lines;
  };

  const svgLines: React.ReactNode[] = [];

  // Render student arrangement
  if (Object.keys(arrangement).length > 0) {
    svgLines.push(...renderLines(arrangement, false, 0.7));
  }

  // Render correct arrangement if showAnswer
  if (showAnswer && correctArrangement && Object.keys(correctArrangement).length > 0) {
    svgLines.push(...renderLines(correctArrangement, true, 0.5));
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

  const readOnly = isInputReadOnly(props);
  const { showAnswer } = useGraderAnswer(props);

  const containerRef = useRef<HTMLDivElement>(null);

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
      />

      <div className="matching-content flex gap-8 relative z-10">
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

                {/* Connection point - RIGHT SIDE */}
                <div
                  data-matching-point
                  data-item-id={pair.leftId}
                  draggable={!readOnly}
                  onDragStart={() => handleDragStart(pair.leftId, 'left')}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDraggedSide(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(pair.leftId, 'left');
                  }}
                  className={`matching-point absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 rounded-full transition-all
                    ${isSelected ? 'bg-blue-500 scale-125' : isDragged ? 'bg-blue-300 scale-125' : isMatched ? 'bg-green-500' : 'bg-gray-400'}
                    ${!readOnly ? 'cursor-grab hover:scale-110' : 'cursor-default'}
                  `}
                  onDragEnter={(e) => {
                    if (draggedSide === 'right') {
                      e.currentTarget.classList.add('opacity-75');
                    }
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('opacity-75');
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

                {/* Connection point - LEFT SIDE */}
                <div
                  data-matching-point
                  data-item-id={rightId}
                  draggable={!readOnly}
                  onDragStart={() => handleDragStart(rightId, 'right')}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDraggedSide(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(rightId, 'right');
                  }}
                  className={`matching-point absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 rounded-full transition-all
                    ${isSelected ? 'bg-blue-500 scale-125' : isDragged ? 'bg-blue-300 scale-125' : isMatchedByStudent ? 'bg-green-500' : 'bg-gray-400'}
                    ${!readOnly ? 'cursor-grab hover:scale-110' : 'cursor-default'}
                  `}
                  onDragEnter={(e) => {
                    if (draggedSide === 'left') {
                      e.currentTarget.classList.add('opacity-75');
                    }
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('opacity-75');
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
            : 'Click dots to match • or drag dots between columns'}
      </div>
    </div>
  );
}
