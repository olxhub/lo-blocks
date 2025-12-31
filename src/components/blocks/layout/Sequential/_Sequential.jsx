// src/components/blocks/_Sequential.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
import HistoryBar from '@/components/common/HistoryBar';
import { fields } from './Sequential';

// Child component for rendering the current item with use()
// Separated because use() cannot be called conditionally
function SequentialItem({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

export default function _Sequential(props) {
  // Get current index from Redux state
  const [index, setIndex] = useReduxState(
    props,
    fields.fieldInfoByField.index,
    0
  );

  // Get the child components to display as sequence items
  // Only render the active child for performance
  const allKids = props.kids || [];
  const numItems = allKids.length;
  const currentChild = index >= 0 && index < numItems ? allKids[index] : null;

  // Navigation handlers
  const handlePrev = () => {
    if (index > 0) {
      setIndex(index - 1);
    }
  };

  const handleNext = () => {
    if (index < numItems - 1) {
      setIndex(index + 1);
    }
  };

  const handleSelect = (newIndex) => {
    if (newIndex >= 0 && newIndex < numItems) {
      setIndex(newIndex);
    }
  };

  // Create history array for HistoryBar (just indices)
  const history = Array.from({ length: numItems }, (_, i) => i);

  return (
    <div className="w-full">
      {/* Icon bar at top */}
      <div className="flex justify-center mb-6 p-4 border-b">
        <HistoryBar
          history={history}
          index={index}
          showDots={true}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelect={handleSelect}
        />
      </div>

      {/* Current sequence item */}
      <div className="flex-1">
        {currentChild && (
          <div key={index} className="min-h-96">
            <SequentialItem props={props} node={currentChild} />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t">
        {numItems > 1 ? (
          <button
            onClick={handlePrev}
            disabled={index <= 0}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
          >
            Previous
          </button>
        ) : <div />}

        <div className="text-sm text-gray-500">
          {index + 1} of {numItems}
        </div>

        {numItems > 1 ? (
          <button
            onClick={handleNext}
            disabled={index >= numItems - 1}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            Next
          </button>
        ) : <div />}
      </div>
    </div>
  );
}
