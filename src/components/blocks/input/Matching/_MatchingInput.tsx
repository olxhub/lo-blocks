'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { isInputReadOnly, useGraderAnswer, refToOlxKey } from '@/lib/blocks';
import { extendIdPrefix } from '@/lib/blocks/idResolver';
import { HandleCommon } from '@/components/common/DragHandle';
import { useOlxJsonMultiple } from '@/lib/blocks/useOlxJson';
import { buildArrangementWithPositions } from '@/lib/utils/shuffle';
import { fields } from './MatchingInput';
import type { MatchingArrangement, ItemPosition } from './types';

/**
 * Render a single matching item's content
 */
function MatchingItemContent({ props, kid, itemIdPrefix }) {
  // FIXME: Should not spread runtime like this - need proper scoped runtime factory
  // Components should treat runtime as black box. Only idPrefix changes at boundaries.
  const itemRuntime = { ...props.runtime, idPrefix: itemIdPrefix };

  const { kids } = useKids({
    ...props,
    kids: [kid],
    runtime: itemRuntime,
  });
  return <>{kids}</>;
}

/**
 * Generate a stable ID for an item if not present
 */
function ensureItemId(item: any, index: number): string {
  if (item.id) return item.id;
  // Fallback: generate ID from index if truly missing
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
 * Connection Lines Component - renders SVG lines between matched items
 */
function ConnectionLines({
  pairs,
  arrangement,
  endOrder,
  correctArrangement,
  showAnswer,
  containerRef,
  selectedId,
  selectedSide,
  mousePos,
}: {
  pairs: MatchingPair[];
  arrangement: MatchingArrangement;
  endOrder: string[];
  correctArrangement: MatchingArrangement;
  showAnswer: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  selectedSide: 'start' | 'end' | null;
  mousePos: { x: number; y: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // useState-ok: layout change tracking for re-renders, not user interaction state
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Calculate positions on-demand from the DOM
  const getPositions = () => {
    if (!containerRef.current) return {};

    const positions: Record<string, ItemPosition> = {};
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    // Find all connection points within this container
    container.querySelectorAll('[data-matching-point]').forEach((el: HTMLElement) => {
      const itemId = el.getAttribute('data-item-id');
      if (itemId) {
        const rect = el.getBoundingClientRect();
        positions[itemId] = {
          itemId,
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top + rect.height / 2,
        };
      }
    });

    return positions;
  };

  // Trigger re-renders on layout changes using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const updateLayout = () => {
      setLayoutVersion(v => v + 1);
    };

    // Use ResizeObserver for robust reflow handling (browser only)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateLayout);
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for scroll and window resize as fallback
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [containerRef]);

  // Get positions (trigger recalculation on layout changes via layoutVersion)
  const positions = getPositions();

  // Render lines
  const renderLines = (currentArrangement: MatchingArrangement, isCorrect: boolean, opacity: number): React.ReactNode[] => {
    const lines: React.ReactNode[] = [];

    Object.entries(currentArrangement).forEach(([leftId, rightId]) => {
      const leftPos = positions[leftId];
      const rightPos = positions[rightId];

      if (leftPos && rightPos) {
        const key = `${leftId}-${rightId}-${isCorrect ? 'correct' : 'student'}`;
        const stroke = isCorrect ? '#22c55e' : '#3b82f6'; // green or blue
        const strokeWidth = isCorrect ? 10 : 2.5; // Correct lines much thicker

        lines.push(
          <line
            key={key}
            x1={leftPos.x}
            y1={leftPos.y}
            x2={rightPos.x}
            y2={rightPos.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
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
    svgLines.push(...renderLines(correctArrangement, true, 0.3));
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
          strokeLinecap="round"
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
  const { kids = [], shuffle = true, idPrefix, idMap = {} } = props;

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

  // Fetch block definitions to get attributes for right-side items
  const rightKidIds = pairs.map((p) => p.rightKid.id).filter((id) => id);
  const { olxJsons: rightKidBlocks } = useOlxJsonMultiple(props, rightKidIds);
  const rightKidBlockMap = Object.fromEntries(rightKidIds.map((id, i) => [id, rightKidBlocks[i]]));

  // State management
  const [arrangement, setArrangement] = useFieldState(props, fields.arrangement, {});
  const [selectedId, setSelectedId] = useFieldState(props, fields.selectedId, null);
  const [selectedSide, setSelectedSide] = useFieldState(props, fields.selectedSide, null);
  let [endOrder, setEndOrder] = useFieldState(props, fields.endOrder, []);

  // Compute endOrder with positioned items if not already set
  if ((!endOrder || endOrder.length === 0)) {
    const rightKidBlocks = pairs.map((p) => rightKidBlockMap[p.rightKid.id]).filter((block) => block);

    const result = buildArrangementWithPositions(rightKidBlocks, {
      idSelector: (block) => block.id,
      positionSelector: (block) => block.attributes?.initialPosition,
      shouldShuffleUnpositioned: shuffle,
    });

    if ('error' in result) {
      return <DisplayError {...result.error} props={props} />;
    }

    // Map arranged blocks back to their rightIds and store for future renders
    const blockIdToRightId = new Map(pairs.map((p) => [p.rightKid.id, p.rightId]));
    const arrangedOrder = result.arrangement.map((block) => blockIdToRightId.get(block.id));
    setEndOrder(arrangedOrder);
    // Use the computed order immediately in this render
    endOrder = arrangedOrder;
  }

  // useState-ok: ephemeral visual feedback state (mouse position for preview line only)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const readOnly = isInputReadOnly(props);
  const { showAnswer } = useGraderAnswer(props);

  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to deselect
  const handleDeselect = () => {
    setSelectedId(null);
    setSelectedSide(null);
  };

  // Track mouse movement for preview lines and handle deselection
  useEffect(() => {
    if (!containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !selectedId) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const handleMouseLeave = () => {
      setMousePos(null);
    };

    const handleContainerClick = (e: MouseEvent) => {
      // If selectedId exists and click was on the container background (not a target/handle)
      if (selectedId && e.target === containerRef.current) {
        handleDeselect();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId) {
        handleDeselect();
      }
    };

    containerRef.current.addEventListener('mousemove', handleMouseMove);
    containerRef.current.addEventListener('mouseleave', handleMouseLeave);
    containerRef.current.addEventListener('click', handleContainerClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      containerRef.current?.removeEventListener('mousemove', handleMouseMove);
      containerRef.current?.removeEventListener('mouseleave', handleMouseLeave);
      containerRef.current?.removeEventListener('click', handleContainerClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId]);

  // Build correct arrangement (odd indices match with their right neighbors)
  const correctArrangement: MatchingArrangement = {};
  pairs.forEach((pair) => {
    correctArrangement[pair.leftId] = pair.rightId;
  });

  // Handle connection point click (start or end)
  const handleConnectionPointClick = (itemId: string, side: 'start' | 'end') => {
    if (readOnly) return;

    // If clicking the same item, toggle disconnect (if connected) or deselect
    if (selectedId === itemId && selectedSide === side) {
      // For start items, check if they're connected and disconnect
      if (side === 'start' && arrangement[itemId] !== undefined) {
        const newArrangement = { ...arrangement };
        delete newArrangement[itemId];
        setArrangement(newArrangement);
        setSelectedId(null);
        setSelectedSide(null);
        return;
      }
      // For end items, find and remove the connection pointing to it
      if (side === 'end') {
        const leftItemWithConnection = Object.entries(arrangement).find(
          ([_, rightId]) => rightId === itemId
        )?.[0];
        if (leftItemWithConnection) {
          const newArrangement = { ...arrangement };
          delete newArrangement[leftItemWithConnection];
          setArrangement(newArrangement);
          setSelectedId(null);
          setSelectedSide(null);
          return;
        }
      }
      // Not connected - just deselect
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
      const leftId = selectedSide === 'start' ? selectedId : itemId;
      const rightId = selectedSide === 'start' ? itemId : selectedId;

      const newArrangement = { ...arrangement };

      // Remove any existing connection from this left item
      delete newArrangement[leftId];

      // Remove any existing connections TO this right item (from other left items)
      Object.keys(newArrangement).forEach((key) => {
        if (newArrangement[key] === rightId) {
          delete newArrangement[key];
        }
      });

      // Create the new connection
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
        endOrder={endOrder}
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
            const isSelected = selectedId === pair.leftId && selectedSide === 'start';
            const isMatched = arrangement[pair.leftId] !== undefined;

            return (
              <div
                key={pair.leftId}
                className={`matching-item matching-left-item relative p-3 border-2 rounded-md transition-all pe-12
                  ${readOnly ? 'bg-gray-100 border-gray-300' : isSelected ? 'border-blue-500 bg-blue-50' : isMatched ? 'bg-green-50 border-green-300' : 'bg-white border-gray-300'}
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

                {/* Connection handle - INLINE END SIDE */}
                <HandleCommon
                  pattern="connect-the-dots"
                  title="Click to select and match"
                  dataMatchingPointId={pair.leftId}
                  className={`
                    absolute end-0 top-0 bottom-0 w-8
                    border-e-2 transition-all
                    ${isSelected ? 'bg-blue-200 border-blue-400' : isMatched ? 'bg-green-100 border-green-300' : 'border-gray-200'}
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(pair.leftId, 'start');
                  }}
                />

                {/* Disconnect button */}
                {isMatched && !readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect(pair.leftId);
                    }}
                    className="absolute top-1 end-2 px-1 py-0 text-xs bg-gray-200 hover:bg-gray-300 text-gray-600 rounded transition-all"
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
          {endOrder.map((rightId) => {
            const pair = pairs.find(p => p.rightId === rightId);
            if (!pair) return null; // Skip if pair not found (shouldn't happen)

            const isSelected = selectedId === rightId && selectedSide === 'end';
            const isMatchedByStudent = Object.values(arrangement).includes(rightId);
            const canConnect = selectedId !== null && selectedSide !== null && selectedSide !== 'end';

            return (
              <div
                key={rightId}
                className={`matching-item matching-right-item relative p-3 border-2 rounded-md transition-all ps-12
                  ${readOnly ? 'bg-gray-100 border-gray-300' : isSelected ? 'border-blue-500 bg-blue-50' : isMatchedByStudent ? 'bg-green-50 border-green-300' : 'bg-white border-gray-300'}
                  ${canConnect && !isMatchedByStudent ? 'hover:border-blue-400 hover:bg-blue-50' : ''}
                `}
              >
                <div className="flex items-center">
                  <div className="flex-1">
                    <MatchingItemContent
                      props={props}
                      kid={pair.rightKid}
                      itemIdPrefix={extendIdPrefix(props, ['right', pair.pairIndex]).idPrefix}
                    />
                  </div>
                </div>

                {/* Connection handle - INLINE START SIDE */}
                <HandleCommon
                  pattern="connect-the-dots"
                  title="Click to select and match"
                  dataMatchingPointId={rightId}
                  className={`
                    absolute start-0 top-0 bottom-0 w-8
                    border-s-2 transition-all
                    ${isSelected ? 'bg-blue-200 border-blue-400' : isMatchedByStudent ? 'bg-green-100 border-green-300' : 'border-gray-200'}
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnectionPointClick(rightId, 'end');
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
            ? selectedSide === 'start'
              ? 'Click a definition on the right to connect'
              : 'Click an item on the left to connect'
            : 'Click dots to match'}
      </div>
    </div>
  );
}
