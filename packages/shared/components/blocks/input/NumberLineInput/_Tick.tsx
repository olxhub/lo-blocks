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

  // A tick is centred on its position, which puts half of an ENDPOINT label
  // outside the line and into the clip of whatever panel holds it. The two
  // ends are flagged here and anchored in CSS so their labels grow inward;
  // the mark itself stays on the position either way.
  const value = Number(props.value);
  const edge = value === Number(line.min) ? 'start'
    : value === Number(line.max) ? 'end'
    : undefined;

  return (
    <span
      className="lo-numberline-tick"
      data-edge={edge}
      style={{ insetInlineStart: `${line.percentOf(value)}%` }}
    >
      <span className="lo-numberline-tick__mark" aria-hidden="true" />
      <span className="lo-numberline-tick__label">{kids}</span>
    </span>
  );
}
