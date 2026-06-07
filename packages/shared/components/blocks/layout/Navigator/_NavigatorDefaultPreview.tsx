// src/components/blocks/layout/Navigator/_NavigatorDefaultPreview.jsx
import type { RuntimeProps } from '@/lib/types';

export default function _NavigatorDefaultPreview(props: RuntimeProps) {
  const { id, title, name, subtitle, description } = props;
  const displayTitle = title || name || id || 'Untitled';

  return (
    <div className="p-3 border-b cursor-pointer transition-all hover:bg-surface">
      <div className="font-medium text-foreground">{displayTitle}</div>
      {subtitle && <div className="text-sm text-secondary">{subtitle}</div>}
      {description && (
        <div className="text-sm text-dimmed mt-1 line-clamp-2">{description}</div>
      )}
    </div>
  );
}
