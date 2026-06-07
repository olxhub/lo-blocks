// CharacterBuilder/_bioSection.tsx
//
// Freeform bio card editor — custom question + freeform text response.
'use client';

import { useInputField } from '@/lib/state';
import { scopedCardProps } from './_helpers';
import { fields } from './CharacterBuilder';
import SectionFooter from './_sectionFooter';
import type { RuntimeProps } from '@/lib/types';

export default function FreeformSection({
  props, cardId, onDone, onRemove,
}: {
  props: RuntimeProps; cardId: string;
  onDone: () => void; onRemove: () => void;
}) {
  const scoped = scopedCardProps(props, cardId);
  const [value, valueProps] = useInputField(scoped, fields.value, '');
  const [customPrompt, promptProps] = useInputField(scoped, fields.customPrompt, '');

  return (
    <div className="space-y-1.5">
      <input
        {...promptProps}
        type="text"
        placeholder="Section title / question (e.g., What does this character do on a Saturday morning?)"
        className="w-full text-sm font-semibold text-gray-800 border-0 border-b border-gray-200 px-0 py-0.5 focus:border-blue-400 focus:outline-none bg-transparent placeholder:font-normal placeholder:text-gray-300"
      />
      <textarea
        {...valueProps}
        placeholder="Write freely..."
        rows={4}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-y min-h-[4rem] focus:border-blue-400 focus:outline-none"
      />
      <SectionFooter onDone={onDone} onRemove={onRemove} hasContent={!!(value || customPrompt)} />
    </div>
  );
}
