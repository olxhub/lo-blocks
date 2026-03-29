// components/common/EmojiSelector.tsx
//
// Emoji picker grid with skin tone modifiers.
// Displays categorized emoji with optional Fitzpatrick skin tone selector.
'use client';

import React from 'react';
import { useFieldState } from '@/lib/state';
import type { EmojiOption } from '@/lib/avatar/emoji';
import { EMOJI_AVATARS, EMOJI_CATEGORIES, SKIN_TONES, applySkinTone } from '@/lib/avatar/emoji';

interface EmojiSelectorProps {
  props: any;                 // block props (for skin tone state)
  skinToneField: any;         // field definition for emojiSkinTone
  value: string;              // current emoji
  onChange: (emoji: string) => void;
  inputProps?: any;           // spread props from useInputField (for text input)
}

export default function EmojiSelector({
  props, skinToneField, value, onChange, inputProps,
}: EmojiSelectorProps) {
  const [activeTone, setActiveTone] = useFieldState(props, skinToneField, '');

  return (
    <div className="space-y-3">
      {/* Preview + custom input row */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-4xl border border-gray-200">
          {value || '?'}
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-gray-500">Type or paste custom emoji</label>
          <input
            {...(inputProps || {})}
            type="text"
            placeholder="🧙"
            value={inputProps ? undefined : value}
            onChange={inputProps ? undefined : (e => onChange(e.target.value))}
            className="w-full border rounded px-2 py-1 text-lg"
          />
        </div>
      </div>

      {/* Skin tone selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 mr-1">Skin tone:</span>
        {SKIN_TONES.map(tone => (
          <button
            key={tone.name}
            onClick={() => {
              setActiveTone(tone.modifier);
              if (value) {
                const base = value.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
                const match = EMOJI_AVATARS.find(e => e.skinTone && e.emoji === base);
                if (match) onChange(applySkinTone(match.emoji, tone.modifier));
              }
            }}
            className={`w-6 h-6 rounded-full border-2 text-sm flex items-center justify-center transition-colors ${
              activeTone === tone.modifier
                ? 'border-blue-500 ring-1 ring-blue-300'
                : 'border-gray-200 hover:border-gray-400'
            }`}
            title={tone.name}
          >
            {tone.modifier ? applySkinTone('🧑', tone.modifier) : '🧑'}
          </button>
        ))}
      </div>

      {/* Categorized emoji grid */}
      {EMOJI_CATEGORIES.map(cat => {
        const items = EMOJI_AVATARS.filter(e => e.category === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{cat.name}</div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {items.map((item: EmojiOption, i: number) => {
                const displayed = item.skinTone ? applySkinTone(item.emoji, activeTone) : item.emoji;
                const isSelected = value === displayed;
                return (
                  <button
                    key={`${item.emoji}-${i}`}
                    onClick={() => onChange(isSelected ? '' : displayed)}
                    className={`flex flex-col items-center p-1 rounded border transition-all min-w-[3.5rem] ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300'
                        : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={item.name}
                  >
                    <span className="text-2xl leading-none">{displayed}</span>
                    <span className="text-[9px] text-gray-500 truncate w-full text-center mt-0.5">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400 italic">
        Emoji render differently across platforms and devices.
        People emoji support skin tone modifiers — select a tone above or type/paste to customize.
      </p>
    </div>
  );
}
