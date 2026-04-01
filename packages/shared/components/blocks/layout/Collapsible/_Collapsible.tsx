// src/components/blocks/layout/Collapsible/_Collapsible.jsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React from 'react';
import { useFieldState } from '@/lib/state';
import { useKids } from '@/lib/render';
import ExpandIcon from '@/components/common/ExpandIcon';
import { useBlockTranslation } from '@/lib/i18n/blockI18n';

export default function _Collapsible(props: RuntimeProps) {
  const { fields, title, label } = props;
  const { t } = useBlockTranslation(props);
  const [expanded, setExpanded] = useFieldState(props, fields.expanded, false);

  // useKids must be called unconditionally, even if we don't display when collapsed
  const { kids: renderedKids } = useKids(props);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const heading = title || label || t('collapsibleClickToExpand');

  return (
    <div className="collapsible-section border border-border rounded-md mb-2">
      <button
        onClick={handleToggle}
        className="collapsible-header w-full flex items-center justify-between p-3 bg-surface hover:bg-muted transition-colors text-left"
        aria-expanded={expanded}
      >
        <span className="collapsible-title font-medium text-foreground">{heading}</span>
        <ExpandIcon expanded={expanded} className="collapsible-arrow w-5 h-5 text-dimmed transition-transform duration-200" />
      </button>

      {expanded && (
        <div className="collapsible-content p-4 border-t border-border">
          {renderedKids}
        </div>
      )}
    </div>
  );
}
