// src/components/common/debug/SettingsTab.tsx
//
// Settings tab for the debug panel.
//
'use client';

import { useFieldState, settings } from '@/lib/state';
import { toOlxKey } from '@/lib/blocks/idResolver';

export default function SettingsTab() {
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [showBlockOverlays, setShowBlockOverlays] = useFieldState(
    null,
    settings.debug,
    false,
    { tag: 'debug-panel', id: toOlxKey('debug-panel') }
  );

  return (
    <div className="debug-settings">
      <div className="debug-setting-item">
        <label className="debug-setting-label">
          <input
            type="checkbox"
            checked={showBlockOverlays}
            onChange={e => setShowBlockOverlays(e.target.checked)}
          />
          <span className="debug-setting-text">
            <strong>Block overlays</strong>
            <span className="debug-setting-description">
              Show borders, tags, IDs, and studio links for all blocks
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
