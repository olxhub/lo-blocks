// src/components/blocks/Sortable/_SortableInput.jsx
'use client';

import React, { useState, useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { generateInitialArrangement, getItemById } from './sortableUtils';
import { renderCompiledKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

export default function _SortableInput(props) {
  const { kids = [], dragMode = 'whole', fields = {} } = props;

  // Parse content from OLX children
  const parsedContent = React.useMemo(() => {
    if (!Array.isArray(kids) || kids.length === 0) {
      return {
        prompt: 'No items provided',
        items: [],
        shuffle: false,
        error: true
      };
    }

    // Create items from kids array - just use them directly for rendering
    const items = kids.map((kid, index) => {
      const itemId = typeof kid === 'string' ? kid : (kid.id || `item-${index}`);
      
      return {
        id: itemId,
        renderKid: kid,
        correctIndex: index + 1  // Simple ordering for now
      };
    });
    
    return {
      prompt: "Drag to sort the items:",
      items,
      shuffle: true
    };
  }, [kids]);

  // Redux state
  const [arrangement, setArrangement] = useReduxState(props, fields.arrangement, []);
  const [attempts, setAttempts] = useReduxState(props, fields.attempts, 0);
  const [submitted, setSubmitted] = useReduxState(props, fields.submitted, false);

  // Initialize arrangement if empty
  React.useEffect(() => {
    if (arrangement.length === 0 && parsedContent.items.length > 0) {
      const initialOrder = generateInitialArrangement(parsedContent.items, parsedContent.shuffle);
      setArrangement(initialOrder);
    }
  }, [arrangement.length, parsedContent.items, parsedContent.shuffle, setArrangement]);

  // Drag state
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const draggedIndex = useRef(null);

  if (parsedContent.error) {
    return (
      <DisplayError
        props={props}
        name="SortableInput Error"
        message={parsedContent.prompt}
        technical={parsedContent.errorDetails}
      />
    );
  }

  const handleDragStart = (e, itemId, index) => {
    if (submitted) return;
    
    setDraggedItem(itemId);
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
    
    if (!draggedItem || draggedIndex.current === null) return;
    
    const newArrangement = [...arrangement];
    const draggedItemId = newArrangement[draggedIndex.current];
    
    // Remove item from current position
    newArrangement.splice(draggedIndex.current, 1);
    
    // Insert at new position
    newArrangement.splice(dropIndex, 0, draggedItemId);
    
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
      {parsedContent.prompt && (
        <div className="prompt mb-4 font-semibold text-lg">
          {parsedContent.prompt}
        </div>
      )}

      <div className="sortable-list space-y-2">
        {arrangement.map((arrangeItem, index) => {
          const item = getItemById(parsedContent.items, arrangeItem);
          if (!item) return null;
          
          const isDragging = draggedItem === arrangeItem;
          const isDragOver = dragOverIndex === index;
          
          // Render child block using renderCompiledKids
          const itemContent = (
            <div>
              {renderCompiledKids({ 
                ...props, 
                kids: [item.renderKid], 
                idPrefix: `${props.idPrefix || ''}.sortitem.${index}` 
              })}
            </div>
          );
          
          return (
            <div
              key={arrangeItem}
              draggable={!submitted && dragMode === 'whole'}
              onDragStart={(e) => handleDragStart(e, arrangeItem, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
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
          ? `Submitted after ${attempts} attempt${attempts !== 1 ? 's' : ''}`
          : 'Drag items to reorder them, then submit your answer'
        }
      </div>
    </div>
  );
}