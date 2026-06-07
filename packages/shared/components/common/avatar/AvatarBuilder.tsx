// components/common/AvatarBuilder.tsx
//
// Multi-mode avatar editor: illustrated (Open Peeps), image URL, or emoji.
// Composes OpenPeepsSelector + EmojiSelector.
//
// Used by:
//   - AvatarEditor block (standalone avatar editing)
//   - CharacterBuilder block (avatar section within character sheet)
//   - CastEditor block (per-member avatar editing)
'use client';

import { useFieldState, useInputField, updateField } from '@/lib/state';
import OpenPeepsSelector from './OpenPeepsSelector';
import EmojiSelector from './EmojiSelector';
import type { RuntimeProps, FieldInfo, Fields } from '@/lib/types';

interface AvatarBuilderProps {
  props: RuntimeProps;
  modeField: FieldInfo;
  srcField: FieldInfo;
  emojiField: FieldInfo;
  emojiSkinToneField: FieldInfo;
  peepsProps: RuntimeProps;
  peepsFields: Fields;
  characterName?: string;
  onDone?: () => void;
}

export default function AvatarBuilder({
  props, modeField, srcField, emojiField, emojiSkinToneField,
  peepsProps, peepsFields, characterName, onDone,
}: AvatarBuilderProps) {
  const [avatarMode, setAvatarMode] = useFieldState(props, modeField, '');
  const [avatarSrc, avatarSrcProps] = useInputField(props, srcField, '');
  const [avatarEmoji, avatarEmojiProps] = useInputField(props, emojiField, '');

  const mode = avatarMode || 'illustrated';

  return (
    <div className="border rounded-lg bg-white p-3 mb-2 space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1" role="tablist" aria-label="Avatar mode">
        {(['illustrated', 'image', 'emoji'] as const).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setAvatarMode(m)}
            className={`px-3 py-1 rounded text-sm ${
              mode === m ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m === 'illustrated' ? 'Illustrated' : m === 'image' ? 'Image' : 'Emoji'}
          </button>
        ))}
      </div>

      {/* Illustrated mode: DiceBear Open Peeps picker */}
      {mode === 'illustrated' && (
        <OpenPeepsSelector
          props={peepsProps}
          fields={peepsFields}
          characterName={characterName}
          previewSize={120}
          compact
        />
      )}

      {/* Image mode: URL input + preview */}
      {mode === 'image' && (
        <div className="flex items-center gap-3">
          {avatarSrc && (
            <img
              key={avatarSrc}
              src={avatarSrc}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border border-gray-200"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1">
            <label className="text-xs text-gray-500">Image URL</label>
            <input
              {...avatarSrcProps}
              type="text"
              placeholder="https://example.com/avatar.png"
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* Emoji mode: picker grid + custom input */}
      {mode === 'emoji' && (
        <EmojiSelector
          props={props}
          skinToneField={emojiSkinToneField}
          value={avatarEmoji}
          onChange={(v: string) => updateField(props, emojiField, v)}
          inputProps={avatarEmojiProps}
        />
      )}

      {/* Done button */}
      {onDone && (
        <div className="flex items-center pt-1 border-t border-gray-100">
          <button onClick={onDone} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
