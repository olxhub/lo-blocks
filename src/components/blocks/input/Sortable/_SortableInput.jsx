// src/components/blocks/Sortable/_SortableInput.jsx
'use client';

import React, { useState, useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { render } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { isInputReadOnly } from '@/lib/blocks';

/**
 * Fisher-Yates shuffle algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} - New shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Extract display positions from kids' initialPosition attributes
 * @param {Array} kids - Array of kid elements with optional initialPosition attributes
 * @returns {Object} - { positioned: items with initialPosition, unpositioned: items without }
 */
function extractDisplayPositions(kids) {
  const positioned = [];
  const unpositioned = [];

  kids.forEach((kid, i) => {
    const index = kid?.attributes?.initialPosition;
    if (index !== undefined) {
      const position = parseInt(index, 10) - 1; // Convert to 0-based
      positioned.push({ kidIndex: i, position });
    } else {
      unpositioned.push(i);
    }
  });

  return { positioned, unpositioned };
}

/**
 * Build initial arrangement based on initialPosition attributes and shuffle parameter
 * @param {Array} kids - Array of kid elements
 * @param {boolean} shuffle - Whether to shuffle unpositioned items
 * @returns {Array} - Initial arrangement of indices
 */
function buildInitialArrangement({ kids, idMap, shuffle }) {
  const indices = Array.from({ length: kids.length }, (_, i) => i);
  const updatedKids = kids.map(kid => idMap?.[kid.id]);
  const hasInitialPositionAttributes = updatedKids.some(kid => kid?.attributes?.initialPosition);

  if (!hasInitialPositionAttributes) {
    // No initialPosition attributes - use shuffle parameter
    return shuffle ? shuffleArray(indices) : indices;
  }

  // Build arrangement based on initialPosition attributes
  const { positioned, unpositioned } = extractDisplayPositions(updatedKids);
  const result = new Array(kids.length);

  // Place items with initialPosition attributes at specified positions
  positioned.forEach(({ kidIndex, position }) => {
    if (position >= 0 && position < kids.length) {
      result[position] = kidIndex;
    }
  });

  // Find empty slots and fill with shuffled unpositioned items
  const emptySlots = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === undefined) {
      emptySlots.push(i);
    }
  }

  const shuffledUnpositioned = shuffleArray(unpositioned);
  emptySlots.forEach((slot, i) => {
    if (i < shuffledUnpositioned.length) {
      result[slot] = shuffledUnpositioned[i];
    }
  });

  return result;
}

export default function _SortableInput(props) {
  const { kids = [], dragMode = 'whole', fields = {}, shuffle = true } = props;

  // State management

  // Redux state
  const [arrangement, setArrangement] = useReduxState(props, fields.arrangement, []);

  // Determine interaction state based on related grader correctness
  const readOnly = isInputReadOnly(props);

  // useState-ok: ephemeral drag state (not persisted, resets on re-render)
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const draggedIndex = useRef(null);

  // Validation
  if (!Array.isArray(kids) || kids.length === 0) {
    return (
      <DisplayError
        props={props}
        name="SortableInput Error"
        message="No items provided"
      />
    );
  }

  // Initialize arrangement if empty
  React.useEffect(() => {
    if (arrangement.length === 0 && kids.length > 0) {
      const initialOrder = buildInitialArrangement(props);
      setArrangement(initialOrder);
    }
  }, [arrangement.length, kids.length, shuffle, setArrangement]);

  const handleDragStart = (e, index) => {
    if (readOnly) return;

    setDraggedItem(index);
    draggedIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem && index !== draggedIndex.current) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedItem === null || draggedIndex.current === null) return;

    const newArrangement = [...arrangement];
    const draggedValue = newArrangement[draggedIndex.current];

    // Remove item from current position
    newArrangement.splice(draggedIndex.current, 1);

    // Insert at new position
    newArrangement.splice(dropIndex, 0, draggedValue);

    setArrangement(newArrangement);

    // Clean up
    setDraggedItem(null);
    setDragOverIndex(null);
    draggedIndex.current = null;
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
    draggedIndex.current = null;
  };

  return (
    <div className="sortable-input p-4 border rounded-lg bg-gray-50">
      <div className="prompt mb-4 font-semibold text-lg">
        Drag to sort the items:
      </div>

      <div className="sortable-list space-y-2">
        {arrangement.map((kidIndex, displayIndex) => {
          const kid = kids[kidIndex];
          if (!kid) return null;

          const isDragging = draggedItem === displayIndex;
          const isDragOver = dragOverIndex === displayIndex;

          const itemContent = render({
            ...props,
            node: kid,
            idPrefix: `${props.idPrefix || ''}.sortitem.${displayIndex}`
          });

          return (
            <div
              key={kidIndex}
              draggable={!readOnly && dragMode === 'whole'}
              onDragStart={dragMode === 'whole' ? (e) => handleDragStart(e, displayIndex) : undefined}
              onDragOver={(e) => handleDragOver(e, displayIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, displayIndex)}
              onDragEnd={dragMode === 'whole' ? handleDragEnd : undefined}
              className={`
                sortable-item bg-white border-2 rounded-md transition-all overflow-hidden
                ${isDragging ? 'opacity-50' : ''}
                ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                ${readOnly ? 'cursor-default bg-gray-100' : 'hover:border-gray-300'}
                ${dragMode === 'whole' && !readOnly ? 'cursor-move' : ''}
                ${dragMode === 'handle' ? 'p-0' : 'p-3'}
              `}
            >
              {dragMode === 'handle' && !readOnly ? (
                <div className="flex items-stretch min-h-[3rem]">
                  <div
                    className="drag-handle flex flex-col justify-center w-10 bg-gray-100 hover:bg-gray-200 cursor-move text-gray-400 hover:text-gray-600 select-none border-r border-gray-200 px-2"
                    draggable
                    onDragStart={(e) => handleDragStart(e, displayIndex)}
                    onDragEnd={handleDragEnd}
                    title="Drag to reorder"
                  >
                    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" className="mx-auto">
                      <circle cx="3" cy="4" r="1.5" />
                      <circle cx="9" cy="4" r="1.5" />
                      <circle cx="3" cy="10" r="1.5" />
                      <circle cx="9" cy="10" r="1.5" />
                      <circle cx="3" cy="16" r="1.5" />
                      <circle cx="9" cy="16" r="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1 p-3">
                    {itemContent}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    {itemContent}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        {readOnly
          ? 'Submitted'
          : 'Drag items to reorder them, then submit your answer'
        }
      </div>
    </div>
  );
}
