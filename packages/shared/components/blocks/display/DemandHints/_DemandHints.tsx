// packages/shared/components/blocks/display/DemandHints/_DemandHints.tsx
'use client';
import type { RuntimeProps, KidEntry } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/player/client/render';
import { isKidArray } from '@/lib/types/kids';

export default function DemandHints(props: RuntimeProps) {
  const { fields, kids } = props;

  // Track how many hints have been revealed (0 = none shown)
  const [hintsRevealed] = useFieldState(props, fields.hintsRevealed, 0);

  // Extract block kids (each is a Hint)
  type BlockEntry = Extract<KidEntry, { type: 'block' }>;
  const hintBlocks = React.useMemo((): BlockEntry[] => {
    if (!kids) return [];
    const entries = isKidArray(kids) ? kids : [kids as KidEntry];
    return entries.filter((k): k is BlockEntry => k.type === 'block');
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
          <div key={hint.definitionKey || index} className="lo-demand-hints__item">
            <span className="lo-demand-hints__number">{index + 1}.</span>
            <div className="lo-demand-hints__content">
              {Array.isArray(renderedHints) ? renderedHints[index] : renderedHints}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
