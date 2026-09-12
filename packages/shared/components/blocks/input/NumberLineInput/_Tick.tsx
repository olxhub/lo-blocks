// packages/shared/components/blocks/input/NumberLineInput/_Tick.tsx
//
// One tick: a mark on the track and the author's Markdown under it.
//
// The tick positions ITSELF from the line's min/max, which arrive through
// NumberLineContext — the parent always knows its own range, so there is no
// walking of the rendered tree to find it (see _ChoiceGroup for the same
// pattern and the reason for it).
//
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useContext } from 'react';
import { useKids } from '@/lib/player/client/render';
import { DisplayError } from '@/lib/util/debug';
import { NumberLineContext } from './_NumberLineInput';

export default function Tick(props: RuntimeProps) {
  const line = useContext(NumberLineContext);
  const { kids } = useKids(props);

  if (!line) {
    return (
      <DisplayError
        title="Tick"
        message="Tick must be inside a NumberLineInput"
        data={{ id: props.id }}
      />
    );
  }

  return (
    <span
      className="lo-numberline-tick"
      style={{ insetInlineStart: `${line.percentOf(Number(props.value))}%` }}
    >
      <span className="lo-numberline-tick__mark" aria-hidden="true" />
      <span className="lo-numberline-tick__label">{kids}</span>
    </span>
  );
}
