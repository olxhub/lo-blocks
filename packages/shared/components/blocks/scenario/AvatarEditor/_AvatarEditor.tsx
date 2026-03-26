// src/components/blocks/scenario/AvatarEditor/_AvatarEditor.tsx
'use client';

import React, { useMemo, useCallback } from 'react';
import { createAvatar } from '@dicebear/core';
import * as openPeepsStyle from '@dicebear/open-peeps';
import { Copy, Check } from 'lucide-react';
import { useFieldState, useInputField, updateField } from '@/lib/state';
import { Face, Head, Accessories, FacialHair, Mask } from '@/lib/avatar/types';

// ---------------------------------------------------------------------------
// Option categories — derived from Zod enum schemas
// ---------------------------------------------------------------------------

const CATEGORIES = {
  face:       { label: 'Face',         options: Face.options },
  head:       { label: 'Head',         options: Head.options },
  accessories:{ label: 'Accessories',  options: Accessories.options },
  facialHair: { label: 'Facial Hair',  options: FacialHair.options },
  mask:       { label: 'Mask',         options: Mask.options },
} as const;

type CategoryKey = keyof typeof CATEGORIES;

const TABS = [
  ...Object.entries(CATEGORIES).map(([key, { label }]) => ({ key, label })),
  { key: 'colors', label: 'Colors' },
];

// Skin tone presets — broad range across ethnicities
const SKIN_COLORS = [
  'ffe0bd', 'ffd5b2', 'f8d5c2', 'e8b697', 'deb08a',  // light
  'd4a574', 'c99a6b', 'b8865a', 'ae7242', 'a0602e',   // medium
  '8d5524', '7a4b2e', '6a3d1f', '523020', '3b1f13',   // dark
];

// Clothing color palette
const CLOTHING_COLORS = [
  '264653', '2a9d8f', '457b9d', '1d3557', '023047',   // cool
  'e9c46a', 'f4a261', 'e76f51', 'ff006e', 'e63946',   // warm
  '606c38', '8338ec', 'bc6c25', 'ffb703', '6c757d',   // accent
];

// Hair/hat color presets (from DiceBear defaults + extras)
const HAIR_COLORS = [
  '2c1b18', '4a312c', '724133', 'a55728', 'b58143',   // browns
  'd6b370', 'ecdcbf', 'e8e1e1', 'f59797', 'c93305',   // blond/red/gray
  '1a1a1a', '4b4b4b', '808080',                         // black/gray
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build DiceBear options from individual field values. */
function toDiceBear(opts: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (!value) continue;
    result[key] = [value];
  }
  if (result.accessories) result.accessoriesProbability = 100;
  if (result.facialHair) result.facialHairProbability = 100;
  if (result.mask) result.maskProbability = 100;
  return result;
}

/** Generate a data URI for an avatar with the given options. */
function renderAvatar(seed: string, opts: Record<string, string>, size: number): string {
  return createAvatar(openPeepsStyle, {
    seed,
    size,
    ...toDiceBear(opts),
  }).toDataUri();
}

// ---------------------------------------------------------------------------
// Color field: swatches + hex input via useInputField
// ---------------------------------------------------------------------------

function ColorField(props: { label: string; presets: string[]; field: any; props: any }) {
  const { label, presets, field, props: blockProps } = props;
  const [value, inputProps] = useInputField(
    blockProps, field, '', { updateValidator: blockProps.locals.isValidHexInput },
  );

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{label}</h4>
      <div className="flex gap-2 flex-wrap mb-2">
        {presets.map(color => (
          <button
            key={color}
            onClick={() => updateField(blockProps, field, value === color ? '' : color)}
            className={`rounded-full border-2 transition-all ${
              value === color
                ? 'border-blue-500 ring-2 ring-blue-300'
                : 'border-gray-300 hover:border-gray-500'
            }`}
            style={{ background: '#' + color, width: 32, height: 32 }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">#</span>
        <input
          {...inputProps}
          type="text"
          placeholder="e8b697"
          maxLength={6}
          className="w-24 border rounded px-2 py-1 text-sm font-mono"
        />
        {value && /^[a-fA-F0-9]{6}$/.test(value) && (
          <div
            className="rounded-full border border-gray-300"
            style={{ background: '#' + value, width: 24, height: 24 }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YAML output with copy button
// ---------------------------------------------------------------------------

function YamlOutput({ yaml, props: blockProps }: { yaml: string; props: any }) {
  const { fields } = blockProps;
  const [copied, setCopied] = useFieldState(blockProps, fields.copied, false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yaml).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard unavailable */ },
    );
  }, [yaml, setCopied]);

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
        title="Copy to clipboard"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <pre className="bg-gray-50 border rounded p-3 text-sm font-mono whitespace-pre overflow-x-auto">
        {yaml}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function _AvatarEditor(props: any) {
  const { fields, locals } = props;
  const compact = props.compact;

  const [characterId, characterIdInputProps] = useInputField(
    props, fields.characterId, '', { updateValidator: locals.isValidCastIdInput },
  );
  const [name, setName] = useFieldState(props, fields.name, '');
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
  const [role, setRole] = useFieldState(props, fields.role, '');
  const [bio, setBio] = useFieldState(props, fields.bio, '');
  const [groups, groupsInputProps] = useInputField(
    props, fields.groups, '', { updateValidator: locals.isValidGroupInput },
  );

  const fieldSetters: Record<CategoryKey, (v: string) => void> = {
    face: setFace, head: setHead, accessories: setAccessories,
    facialHair: setFacialHair, mask: setMask,
  };

  const fieldValues: Record<string, string> = {
    face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor,
  };

  const effectiveSeed = seed || characterId || 'avatar';

  const yamlOutput = locals.buildYaml(characterId, name, seed, fieldValues, { role, bio, groups });

  // Main preview
  const mainPreview = useMemo(
    () => renderAvatar(effectiveSeed, fieldValues, 200),
    [effectiveSeed, face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor],
  );

  // Thumbnails for current enum tab
  const thumbnails = useMemo(() => {
    const category = CATEGORIES[activeTab as CategoryKey];
    if (!category) return [];
    return category.options.map(value => ({
      value,
      dataUri: renderAvatar(effectiveSeed, { ...fieldValues, [activeTab]: value }, 64),
    }));
  }, [activeTab, effectiveSeed, face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor]);

  const handleSelect = useCallback((category: CategoryKey, value: string) => {
    const setter = fieldSetters[category];
    const current = fieldValues[category];
    setter(current === value ? '' : value);
  }, [face, head, accessories, facialHair, mask]);

  const handleClearAppearance = useCallback(() => {
    setFace(''); setHead(''); setAccessories('');
    setFacialHair(''); setMask('');
    updateField(props, fields.skinColor, '');
    updateField(props, fields.clothingColor, '');
    updateField(props, fields.headContrastColor, '');
  }, [props, fields]);

  return (
    <div className="avatar-editor border rounded-lg bg-white p-4 space-y-4">
      {/* --- Avatar picker: preview + tabs --- */}
      <div className="flex gap-6 flex-col sm:flex-row">
        {/* Left: preview + ID/seed */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
          <img
            src={mainPreview}
            alt={name || characterId || 'Avatar preview'}
            className="rounded-full bg-gray-100"
            style={{ width: 160, height: 160 }}
          />
          <input
            {...characterIdInputProps}
            type="text"
            placeholder="ID (e.g. robert)"
            className="w-40 border rounded px-2 py-1 text-sm font-mono"
          />
          <input
            type="text"
            placeholder="Seed (optional)"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            className="w-40 border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={handleClearAppearance}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear appearance
          </button>
        </div>

        {/* Right: tabbed picker */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 mb-3 flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded text-sm ${
                  activeTab === tab.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Enum thumbnail grid */}
          {activeTab !== 'colors' && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {thumbnails.map(({ value, dataUri }) => {
                const selected = fieldValues[activeTab] === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleSelect(activeTab as CategoryKey, value)}
                    className={`flex flex-col items-center p-1 rounded border transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img
                      src={dataUri}
                      alt={value}
                      className="rounded-full"
                      style={{ width: 56, height: 56 }}
                    />
                    <span className="text-[10px] text-gray-600 truncate w-full text-center mt-1">
                      {value}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Color swatches + hex input */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              <ColorField label="Skin Color" presets={SKIN_COLORS} field={fields.skinColor} props={props} />
              <ColorField label="Clothing Color" presets={CLOTHING_COLORS} field={fields.clothingColor} props={props} />
              <ColorField label="Hair Color" presets={HAIR_COLORS} field={fields.headContrastColor} props={props} />
            </div>
          )}
        </div>
      </div>

      {/* --- Metadata + YAML (hidden in compact mode) --- */}
      {!compact && (
        <>
          <details className="border rounded">
            <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer bg-gray-50 hover:bg-gray-100">
              Metadata
            </summary>
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Name</label>
                  <input
                    type="text"
                    placeholder="Display name (if different from ID)"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Data Analysis Intern"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Bio</label>
                <textarea
                  placeholder="Short character biography"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Groups</label>
                <input
                  {...groupsInputProps}
                  type="text"
                  placeholder="e.g. interns,team_a"
                  className="w-full border rounded px-2 py-1 text-sm font-mono"
                />
              </div>
            </div>
          </details>

          <YamlOutput yaml={yamlOutput} props={props} />
        </>
      )}
    </div>
  );
}

export default _AvatarEditor;
