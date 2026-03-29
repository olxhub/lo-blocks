// src/components/common/debug/SettingsTab.tsx
//
// Settings tab for the debug panel.
// Includes block overlays toggle and theme controls.
//
'use client';

import { useFieldState, settings } from '@/lib/state';

const COLOR_MODES = ['auto', 'light', 'dark'] as const;
const THEMES = ['default', 'literary', 'hightech'] as const;
const BRANDS = ['default', 'mit'] as const;

function ToggleGroup({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="debug-setting-item">
      <span className="debug-setting-text">
        <strong>{label}</strong>
        <span className="debug-setting-description">{description}</span>
      </span>
      <div className="debug-toggle-group">
        {options.map(opt => (
          <button
            key={opt}
            className={`debug-toggle-btn${opt === value ? ' active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsTab() {
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [showBlockOverlays, setShowBlockOverlays] = useFieldState(
    null,
    settings.debug,
    false,
    { tag: 'debug_panel' }
  );

  // Theme settings — stored in Redux, synced to DOM by ThemeSync component.
  // Default to current DOM values so toggles reflect reality on first open.
  const domColorMode = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-color-mode') || 'auto'
    : 'auto';
  const domTheme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') || 'default'
    : 'default';
  const domBrand = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-brand') || 'default'
    : 'default';

  const [colorMode, setColorMode] = useFieldState(
    null, settings.themeColorMode, domColorMode, { tag: 'debug_panel' }
  );
  const [theme, setTheme] = useFieldState(
    null, settings.themeTheme, domTheme, { tag: 'debug_panel' }
  );
  const [brand, setBrand] = useFieldState(
    null, settings.themeBrand, domBrand, { tag: 'debug_panel' }
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

      <div className="debug-section-title" style={{ marginTop: 16 }}>Theme</div>

      <ToggleGroup
        label="Color mode"
        description="Controls data-color-mode on <html>"
        options={COLOR_MODES}
        value={colorMode}
        onChange={setColorMode}
      />

      <ToggleGroup
        label="Theme"
        description="Controls data-theme on <html>"
        options={THEMES}
        value={theme}
        onChange={setTheme}
      />

      <ToggleGroup
        label="Brand"
        description="Controls data-brand on <html>"
        options={BRANDS}
        value={brand}
        onChange={setBrand}
      />
    </div>
  );
}
