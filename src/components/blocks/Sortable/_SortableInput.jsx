// src/components/blocks/Sortable/_SortableInput.jsx
'use client';

import React, { useState, useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { render } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

export default function _SortableInput(props) {
  const { kids = [], dragMode = 'whole', fields = {}, shuffle = true } = props;

  // State management

  // Redux state
  const [arrangement, setArrangement] = useReduxState(props, fields.arrangement, []);
  const [submitted, setSubmitted] = useReduxState(props, fields.submitted, false);

  // Drag state
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

  // Simple Fisher-Yates shuffle
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Initialize arrangement if empty - just an array of indices
  React.useEffect(() => {
    if (arrangement.length === 0 && kids.length > 0) {
      const indices = Array.from({ length: kids.length }, (_, i) => i);
      const initialOrder = shuffle ? shuffleArray(indices) : indices;
      setArrangement(initialOrder);
    }
  }, [arrangement.length, kids.length, shuffle, setArrangement]);

  const handleDragStart = (e, index) => {
    if (submitted) return;
    
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

          console.log(kid);
          // Render child block using render to handle it properly
          const itemContent = render({
            ...props,
            node: kid,
            idPrefix: `${props.idPrefix || ''}.sortitem.${displayIndex}` 
          });
          
          return (
            <div
              key={kidIndex}
              draggable={!submitted && dragMode === 'whole'}
              onDragStart={(e) => handleDragStart(e, displayIndex)}
              onDragOver={(e) => handleDragOver(e, displayIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, displayIndex)}
              onDragEnd={handleDragEnd}
              className={`
                sortable-item p-3 bg-white border-2 rounded-md cursor-move transition-all
                ${isDragging ? 'opacity-50' : ''}
                ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                ${submitted ? 'cursor-default bg-gray-100' : 'hover:border-gray-300'}
              `}
            >
              <div className="flex items-center gap-3">
                {dragMode === 'handle' && !submitted && (
                  <div className="drag-handle cursor-move text-gray-400">
                    ⋮⋮
                  </div>
                )}
                <div className="flex-1">
                  {itemContent}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        {submitted 
          ? 'Submitted'
          : 'Drag items to reorder them, then submit your answer'
        }
      </div>
    </div>
  );
}
