// packages/shared/components/common/avatar/AvatarPreview.tsx
//
// Small avatar thumbnail button that shows the current avatar state
// (illustrated / image / emoji). Used in headers and member lists.
'use client';

import React, { useMemo } from 'react';
import { User } from 'lucide-react';
import { useFieldState } from '@/lib/state';
import { renderAvatar } from '@/lib/avatar/render';
import type { RuntimeProps, FieldInfo, Fields } from '@/lib/types';

interface AvatarPreviewProps {
  props: RuntimeProps;
  modeField: FieldInfo;
  srcField: FieldInfo;
  emojiField: FieldInfo;
  peepsProps: RuntimeProps;
  peepsFields: Fields;
  characterName?: string;
  isActive?: boolean;
  onClick?: () => void;
  size?: number;
}

export default function AvatarPreview({
  props, modeField, srcField, emojiField,
  peepsProps, peepsFields, characterName,
  isActive, onClick, size = 40,
}: AvatarPreviewProps) {
  const [avatarMode] = useFieldState(props, modeField, '');
  const [avatarSrc] = useFieldState(props, srcField, '');
  const [avatarEmoji] = useFieldState(props, emojiField, '');

  const [seed] = useFieldState(peepsProps, peepsFields.seed, '');
  const [face] = useFieldState(peepsProps, peepsFields.face, '');
  const [head] = useFieldState(peepsProps, peepsFields.head, '');
  const [accessories] = useFieldState(peepsProps, peepsFields.accessories, '');
  const [facialHair] = useFieldState(peepsProps, peepsFields.facialHair, '');
  const [mask] = useFieldState(peepsProps, peepsFields.mask, '');
  const [skinColor] = useFieldState(peepsProps, peepsFields.skinColor, '');
  const [clothingColor] = useFieldState(peepsProps, peepsFields.clothingColor, '');
  const [headContrastColor] = useFieldState(peepsProps, peepsFields.headContrastColor, '');

  const fieldVals = { face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor };
  const hasIllustrated = !!(face || head || accessories || facialHair || mask || skinColor || clothingColor || headContrastColor || seed);

  const effectiveSeed = seed || characterName || 'avatar';
  const previewUri = useMemo(
    () => renderAvatar(effectiveSeed, fieldVals, size * 2),
    [effectiveSeed, face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor, size],
  );

  const mode = avatarMode || 'illustrated';

  const content = (
    <>
      {mode === 'image' && avatarSrc ? (
        <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
      ) : mode === 'emoji' && avatarEmoji ? (
        <span className="leading-none" style={{ fontSize: size * 0.5 }}>{avatarEmoji}</span>
      ) : hasIllustrated ? (
        <img src={previewUri} alt="Avatar" className="w-full h-full" />
      ) : (
        <User size={size * 0.5} className="text-gray-300" />
      )}
    </>
  );

  if (!onClick) {
    return (
      <div
        className={`shrink-0 rounded-full border-2 flex items-center justify-center overflow-hidden ${
          isActive ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
        }`}
        style={{ width: size, height: size }}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border-2 flex items-center justify-center overflow-hidden transition-colors ${
        isActive ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
      }`}
      style={{ width: size, height: size }}
      title="Edit avatar"
    >
      {content}
    </button>
  );
}
