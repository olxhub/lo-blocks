// src/components/blocks/Sortable/_SortableInput.jsx
'use client';

import React, { useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';
import { isInputReadOnly, useGraderAnswer, refToOlxKey } from '@/lib/blocks';
import { extendIdPrefix } from '@/lib/blocks/idResolver';
import { useOlxJsonMultiple } from '@/lib/blocks/useOlxJson';
import { buildArrangementWithPositions } from '@/lib/utils/shuffle';

// Component to render a single sortable item's content
function SortableItemContent({ props, kid, itemIdPrefix }) {
  const { kids } = useKids({ ...props, kids: [kid], idPrefix: itemIdPrefix });
  return <>{kids}</>;
}

export default function _SortableInput(props) {
  const { kids = [], dragMode = 'whole', fields = {}, shuffle = true } = props;

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

  // Fetch block definitions to get attributes
  const kidIds = kids.filter((k) => k?.id).map((k) => k.id);
  const { olxJsons: kidBlocks } = useOlxJsonMultiple(props, kidIds);
  const kidBlockMap = Object.fromEntries(kidIds.map((id, i) => [id, kidBlocks[i]]));

  // State management
  const [arrangement, setArrangement] = useReduxState(props, fields.arrangement, []);
  const [draggedItem, setDraggedItem] = useReduxState(props, fields.draggedItem, null);
  const [dragOverIndex, setDragOverIndex] = useReduxState(props, fields.dragOverIndex, null);
  const { showAnswer } = useGraderAnswer(props);
  const readOnly = isInputReadOnly(props);

  // Initialize arrangement if empty
  let currentArrangement = arrangement;
  if (arrangement.length === 0 && kids.length > 0) {
    const blockDefinitions = kids.map((kid) => kidBlockMap[kid.id]).filter((block) => block);

    const result = buildArrangementWithPositions(blockDefinitions, {
      idSelector: (block) => block.id,
      positionSelector: (block) => block.attributes?.initialPosition,
      shouldShuffleUnpositioned: shuffle,
    });

    if ('error' in result) {
      return <DisplayError {...result.error} props={props} />;
    }

    // Convert arranged blocks back to indices based on original kids array
    const kidIdToIndex = new Map(kids.map((kid, i) => [kid.id, i]));
    const indicesArrangement = result.arrangement.map(
      (block) => kidIdToIndex.get(block.id)
    );
    setArrangement(indicesArrangement);
    // Use the computed arrangement immediately in this render
    currentArrangement = indicesArrangement;
  }

  const handleDragStart = (e, index) => {
    if (readOnly) return;

    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem !== null && index !== draggedItem) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedItem === null) return;

    const newArrangement = [...arrangement];
    const draggedValue = newArrangement[draggedItem];

    // Remove item from current position
    newArrangement.splice(draggedItem, 1);

    // Insert at new position
    newArrangement.splice(dropIndex, 0, draggedValue);

    setArrangement(newArrangement);

    // Clean up
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  return (
    <div className="sortable-input p-4 border rounded-lg bg-gray-50">
      <div className="prompt mb-4 font-semibold text-lg">
        Drag to sort the items:
      </div>

      <div className="sortable-list space-y-2">
        {currentArrangement.map((kidIndex, displayIndex) => {
          const kid = kids[kidIndex];
          if (!kid) return null;

          const isDragging = draggedItem === displayIndex;
          const isDragOver = dragOverIndex === displayIndex;
          // Correct position is kidIndex + 1 (1-indexed)
          const correctPosition = kidIndex + 1;
          const itemIdPrefix = extendIdPrefix(props, ['sortitem', displayIndex]).idPrefix;

          const itemContent = (
            <SortableItemContent props={props} kid={kid} itemIdPrefix={itemIdPrefix} />
          );

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
                sortable-item relative bg-white border-2 rounded-md transition-all overflow-hidden
                ${isDragging ? 'opacity-50' : ''}
                ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                ${readOnly ? 'cursor-default bg-gray-100' : 'hover:border-gray-300'}
                ${dragMode === 'whole' && !readOnly ? 'cursor-move' : ''}
                ${dragMode === 'handle' ? 'p-0' : 'p-3'}
              `}
            >
              {showAnswer && (
                <span className="lo-sortable-position-label">{correctPosition}</span>
              )}
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
        {showAnswer
          ? 'Numbers show the correct position for each item'
          : readOnly
            ? 'Submitted'
            : 'Drag items to reorder them, then submit your answer'
        }
      </div>
    </div>
  );
}
