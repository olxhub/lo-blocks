// CharacterBuilder/_addMenu.tsx
//
// Multi-step add-section menu: type selection → dimension picker or
// stats preset selection.
'use client';

import { Plus } from 'lucide-react';
import type { Dimension, DimensionCategory, StatPreset } from '@/lib/avatar/traits';

export default function AddMenu({
  activeCard, setActiveCard, onAddDimension, onAddBio, onAddStats, locals,
}: {
  activeCard: string; setActiveCard: (s: string) => void;
  onAddDimension: (key: string) => void; onAddBio: () => void;
  onAddStats: (key: string) => void; locals: any;
}) {
  const menuStep = activeCard.startsWith('menu:') ? activeCard.slice(5) : 'closed';
  const setMenu = (step: string) => setActiveCard(step === 'closed' ? '' : `menu:${step}`);
  const close = () => setActiveCard('');

  if (menuStep === 'closed') {
    return (
      <button
        onClick={() => setMenu('type')}
        className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        <Plus size={14} /> Add section
      </button>
    );
  }

  if (menuStep === 'type') {
    return (
      <div className="text-sm text-gray-500 flex items-center gap-3">
        <span>Add:</span>
        <button onClick={() => setMenu('dimension')} className="text-blue-600 hover:text-blue-800 hover:underline">
          Trait
        </button>
        <button onClick={() => { onAddBio(); }} className="text-blue-600 hover:text-blue-800 hover:underline">
          Freeform
        </button>
        <button onClick={() => setMenu('stats')} className="text-blue-600 hover:text-blue-800 hover:underline">
          Stats
        </button>
        <button onClick={close} className="text-gray-300 hover:text-gray-500 ml-auto text-xs">
          Cancel
        </button>
      </div>
    );
  }

  if (menuStep === 'dimension') {
    const categories: { key: DimensionCategory; name: string }[] = locals.DIMENSION_CATEGORIES;
    const allDimensions: Dimension[] = locals.DIMENSIONS;
    return (
      <div className="text-sm space-y-2">
        <div className="flex items-center justify-between text-gray-500">
          <span className="font-medium">Pick a trait:</span>
          <button onClick={close} className="text-gray-300 hover:text-gray-500 text-xs">Cancel</button>
        </div>
        {categories.map(cat => {
          const dims = allDimensions.filter((d: Dimension) => d.category === cat.key);
          if (dims.length === 0) return null;
          return (
            <div key={cat.key}>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{cat.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {dims.map((d: Dimension) => (
                  <button
                    key={d.key}
                    onClick={() => onAddDimension(d.key)}
                    className="px-2 py-0.5 rounded-full border border-gray-200 text-xs text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-300 whitespace-nowrap transition-colors"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (menuStep === 'stats') {
    const presets: StatPreset[] = locals.STAT_PRESETS;
    return (
      <div className="text-sm text-gray-500 flex items-center gap-3">
        <span>Preset:</span>
        {presets.map((p: StatPreset) => (
          <button key={p.key} onClick={() => onAddStats(p.key)} className="text-blue-600 hover:text-blue-800 hover:underline">
            {p.name}
          </button>
        ))}
        <button onClick={close} className="text-gray-300 hover:text-gray-500 ml-auto text-xs">Cancel</button>
      </div>
    );
  }

  return null;
}
