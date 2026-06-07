// CharacterBuilder/_sectionFooter.tsx
//
// Shared footer for all card types: Done + Remove buttons.
'use client';


export default function SectionFooter({ onDone, onRemove, hasContent }: {
  onDone: () => void; onRemove: () => void; hasContent: boolean;
}) {
  const handleRemove = () => {
    if (!hasContent || window.confirm('Remove this section? Content will be lost.')) {
      onRemove();
    }
  };

  return (
    <div className="flex items-center gap-3 mt-2 pt-1.5 border-t border-gray-100">
      <button onClick={onDone} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
        Done
      </button>
      <button onClick={handleRemove} className="text-xs text-gray-300 hover:text-red-500 transition-colors">
        Remove
      </button>
    </div>
  );
}
