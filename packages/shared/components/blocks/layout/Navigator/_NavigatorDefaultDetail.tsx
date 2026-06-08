// packages/shared/components/blocks/layout/Navigator/_NavigatorDefaultDetail.tsx
import React from 'react';
import type { RuntimeProps } from '@/lib/types';

export default function _NavigatorDefaultDetail(props: RuntimeProps) {
  const { id, title, name, subtitle, description, details } = props;
  const displayTitle = title || name || id || 'Untitled';

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold text-foreground mb-4">{displayTitle}</h2>

      {subtitle && (
        <p className="text-lg text-accent font-medium mb-3">{subtitle}</p>
      )}

      {description && (
        <div className="mb-4">
          <h3 className="font-medium text-foreground mb-2">Description</h3>
          <p className="text-secondary">{description}</p>
        </div>
      )}

      {details && typeof details === 'object' && Object.keys(details).length > 0 && (
        <div className="space-y-3">
          {Object.entries(details).map(([key, value]) => (
            <div key={key}>
              <h4 className="font-medium text-foreground capitalize">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </h4>
              {Array.isArray(value) ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  {value.map((item, index) => (
                    <span key={index} className="px-2 py-1 bg-accent-subtle text-accent rounded text-sm">
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-secondary mt-1">{value as React.ReactNode}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
