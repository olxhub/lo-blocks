// components/common/OpenPeepsSelector.tsx
//
// Tabbed DiceBear Open Peeps avatar picker.
// Renders a preview + seed input on the left, tabbed option grid on the right.
// Used by AvatarEditor (standalone) and AvatarBuilder (inside CharacterBuilder).
'use client';

import React, { useMemo, useCallback } from 'react';
import { useFieldState, updateField } from '@/lib/state';
import {
  renderAvatar, CATEGORIES, TABS,
  SKIN_COLORS, CLOTHING_COLORS, HAIR_COLORS,
  type CategoryKey,
} from '@/lib/avatar/render';
import ColorField from './ColorField';
import type { RuntimeProps, Fields } from '@/lib/types';

interface OpenPeepsSelectorProps {
  props: RuntimeProps;
  fields: Fields;
  characterName?: string;
  previewSize?: number;
  compact?: boolean;
}

export default function OpenPeepsSelector({
  props, fields, characterName, previewSize = 120, compact,
}: OpenPeepsSelectorProps) {
  const [seed, setSeed] = useFieldState(props, fields.seed, '');
  const [activeTab, setActiveTab] = useFieldState(props, fields.activeTab, 'face');
  const [face, setFace] = useFieldState(props, fields.face, '');
  const [head, setHead] = useFieldState(props, fields.head, '');
  const [accessories, setAccessories] = useFieldState(props, fields.accessories, '');
  const [facialHair, setFacialHair] = useFieldState(props, fields.facialHair, '');
  const [mask, setMask] = useFieldState(props, fields.mask, '');
  const [skinColor] = useFieldState(props, fields.skinColor, '');
  const [clothingColor] = useFieldState(props, fields.clothingColor, '');
  const [headContrastColor] = useFieldState(props, fields.headContrastColor, '');

  const fieldSetters: Record<CategoryKey, (v: string) => void> = {
    face: setFace, head: setHead, accessories: setAccessories,
    facialHair: setFacialHair, mask: setMask,
  };

  const fieldVals: Record<string, string> = {
    face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor,
  };

  const effectiveSeed = seed || characterName || 'avatar';

  const mainPreview = useMemo(
    () => renderAvatar(effectiveSeed, fieldVals, previewSize + 40),
    [effectiveSeed, face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor, previewSize],
  );

  const thumbSize = compact ? 48 : 56;

  const thumbnails = useMemo(() => {
    const category = CATEGORIES[activeTab as CategoryKey];
    if (!category) return [];
    return category.options.map(value => ({
      value,
      dataUri: renderAvatar(effectiveSeed, { ...fieldVals, [activeTab]: value }, 64),
    }));
  }, [activeTab, effectiveSeed, face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor]);

  const handleSelect = useCallback((category: CategoryKey, value: string) => {
    const setter = fieldSetters[category];
    const current = fieldVals[category];
    setter(current === value ? '' : value);
  }, [face, head, accessories, facialHair, mask]);

  const handleClearAppearance = useCallback(() => {
    setFace(''); setHead(''); setAccessories('');
    setFacialHair(''); setMask('');
    updateField(props, fields.skinColor, '');
    updateField(props, fields.clothingColor, '');
    updateField(props, fields.headContrastColor, '');
  }, [props, fields]);

  const tabPx = compact ? 'px-2 py-0.5' : 'px-3 py-1';
  const tabText = compact ? 'text-xs' : 'text-sm';

  return (
    <div className="flex gap-4 flex-col sm:flex-row">
      {/* Left: preview + seed */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <img
          src={mainPreview}
          alt="Avatar preview"
          className="rounded-full bg-gray-100"
          style={{ width: previewSize, height: previewSize }}
        />
        <input
          type="text"
          placeholder={characterName ? `Seed (${characterName})` : 'Seed (optional)'}
          value={seed}
          onChange={e => setSeed(e.target.value)}
          className={`border rounded px-2 py-1 text-sm ${compact ? 'w-32' : 'w-40'}`}
        />
        <button
          onClick={handleClearAppearance}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear appearance
        </button>
      </div>

      {/* Right: tabbed picker */}
      <div className="flex-1 min-w-0">
        <div className="flex gap-1 mb-2 flex-wrap" role="tablist" aria-label="Avatar feature">
          {TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`${tabPx} rounded ${tabText} ${
                activeTab === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Enum thumbnail grid */}
        {activeTab !== 'colors' && (
          <div className={'grid gap-1.5 grid-cols-4 sm:grid-cols-6'}>
            {thumbnails.map(({ value, dataUri }) => {
              const selected = fieldVals[activeTab] === value;
              return (
                <button
                  key={value}
                  onClick={() => handleSelect(activeTab as CategoryKey, value)}
                  className={`flex flex-col items-center p-0.5 rounded border transition-all ${
                    selected
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <img src={dataUri} alt={value} className="rounded-full" style={{ width: thumbSize, height: thumbSize }} />
                  <span className={`text-gray-500 truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[10px] mt-1'}`}>
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Color swatches + hex input */}
        {activeTab === 'colors' && (
          <div className="space-y-3">
            <ColorField label="Skin Color" presets={SKIN_COLORS} field={fields.skinColor} props={props} />
            <ColorField label="Clothing Color" presets={CLOTHING_COLORS} field={fields.clothingColor} props={props} />
            <ColorField label="Hair Color" presets={HAIR_COLORS} field={fields.headContrastColor} props={props} />
          </div>
        )}
      </div>
    </div>
  );
}
