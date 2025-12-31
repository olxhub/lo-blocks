// src/components/blocks/display/DemandHints/_DemandHints.jsx
'use client';

import React from 'react';
import { useReduxState } from '@/lib/state';
import { useKids } from '@/lib/render';

export default function _DemandHints(props) {
  const { fields, kids } = props;

  // Track how many hints have been revealed (0 = none shown)
  const [hintsRevealed] = useReduxState(props, fields.hintsRevealed, 0);

  // Extract block kids (each is a Hint)
  const hintBlocks = React.useMemo(() => {
    if (!kids) return [];
    if (Array.isArray(kids)) {
      return kids.filter(k => k.type === 'block');
    }
    return kids.type === 'block' ? [kids] : [];
  }, [kids]);

  const totalHints = hintBlocks.length;
  const revealedHints = hintBlocks.slice(0, hintsRevealed);

  // useKids must be called unconditionally - render all revealed hints at once
  const { kids: renderedHints } = useKids({ ...props, kids: revealedHints });

  if (totalHints === 0) {
    return null; // No hints defined
  }

  if (hintsRevealed === 0) {
    return null; // No hints revealed yet
  }

  return (
    <div className="lo-demand-hints">
      <div className="lo-demand-hints__header">
        Hints ({hintsRevealed} of {totalHints})
      </div>
      <div className="lo-demand-hints__list">
        {revealedHints.map((hint, index) => (
          <div key={hint.id || index} className="lo-demand-hints__item">
            <span className="lo-demand-hints__number">{index + 1}.</span>
            <div className="lo-demand-hints__content">
              {renderedHints[index]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
