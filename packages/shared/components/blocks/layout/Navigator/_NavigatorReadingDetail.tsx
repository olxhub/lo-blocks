// packages/shared/components/blocks/layout/Navigator/_NavigatorReadingDetail.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useBlock } from '@/lib/render';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { StateRef } from '@/lib/types';

function ReadingContent({ props, readingRef }) {
  // readingRef comes from the Navigator's YAML item data, parsed at runtime —
  // it never passes through the parser's namespace qualification the way an
  // authored OLX attribute (e.g. <Use ref>) does. Qualify it here against the
  // block's own namespace before handing it to useBlock (which expects a
  // fully-qualified StateKey), mirroring how _UseDynamic resolves its target.
  const stateKey = stateKeyForGlobalRef(readingRef as StateRef, props.runtime.ns);
  const { block } = useBlock(props, stateKey);
  return <>{block}</>;
}

export default function _NavigatorReadingDetail(props: RuntimeProps) {
  const { ref, name, title, subtitle } = props;

  if (!ref) {
    return (
      <div className="p-6 text-error">
        No block reference specified. Use ref attribute.
      </div>
    );
  }

  const displayTitle = title || name || 'Reading';

  return (
    <div className="reading-detail-pane">
      <div className="sticky top-0 bg-background border-b p-4 z-10">
        <h2 className="text-xl font-semibold text-foreground">{displayTitle}</h2>
        {subtitle && <p className="text-sm text-secondary mt-1">{subtitle}</p>}
      </div>
      <div className="p-6 prose prose-sm max-w-none">
        <ReadingContent props={props} readingRef={ref} />
      </div>
    </div>
  );
}
