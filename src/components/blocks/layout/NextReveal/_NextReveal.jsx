// src/components/blocks/layout/NextReveal/_NextReveal.jsx
'use client';

import React, { useEffect, useRef } from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';
function RevealedItem({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

export default function _NextReveal(props) {
  const { fields } = props;
  const [currentStep, setCurrentStep] = useReduxState(
    props,
    fields.currentStep,
    1  // Start with first item revealed
  );

  const bottomRef = useRef(null);

  const allKids = props.kids || [];
  const numItems = allKids.length;

  // Scroll to bottom when currentStep changes
  useEffect(() => {
    // jsdom doesn't implement scrollIntoView, so tests fail without this guard
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < numItems) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Render revealed items
  const revealedItems = allKids.slice(0, currentStep).map((child, index) => (
    <div key={index} className="mb-6">
      <RevealedItem props={props} node={child} />
    </div>
  ));

  return (
    <div className="next-reveal-container">
      {revealedItems}

      {currentStep < numItems && (
        <div className="flex justify-center my-4">
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
