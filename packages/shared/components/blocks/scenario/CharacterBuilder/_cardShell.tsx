// CharacterBuilder/_cardShell.tsx
//
// Card wrapper: drag handle + expand/collapse + content routing.
// Each card is either expanded (showing the appropriate section editor)
// or collapsed (showing a one-line summary).
'use client';

import React, { useMemo, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useFieldState } from '@/lib/state';
import { scopedCardProps, fmtStat } from './_helpers';
import { fields } from './CharacterBuilder';
import DimensionSection from './_traitsSection';
import FreeformSection from './_bioSection';
import StatsSection from './_statsSection';
import type { RuntimeProps } from '@/lib/types';
import type { Dimension, StatPreset } from '@/lib/avatar/traits';

// ---------------------------------------------------------------------------
// Collapsed section (inline — reads like a character sheet)
// ---------------------------------------------------------------------------

function CollapsedSection({
  cardType, dimensionName, presetName, customPrompt, value, statSummary, onClick,
}: {
  cardType: string; dimensionName: string; presetName: string;
  customPrompt: string; value: string; statSummary: string; onClick: () => void;
}) {
  const label = cardType === 'dimension' ? dimensionName
    : cardType === 'bio' ? (customPrompt || 'Freeform')
    : presetName || 'Stats';

  const preview = cardType === 'stats' ? statSummary : value || '';

  return (
    <div
      className="cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={onClick}
    >
      <span className="text-sm font-semibold text-gray-700">{label}.</span>
      {preview ? (
        <span className="text-sm text-gray-500 ml-1">
          {cardType === 'stats'
            ? <span className="font-mono text-xs">{preview}</span>
            : preview}
        </span>
      ) : (
        <span className="text-sm text-gray-300 ml-1 italic">click to edit</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper: gripper on left + content on right
// ---------------------------------------------------------------------------

export default function Section({
  props, cardId, isActive, onActivate, onDone, onDelete,
  displayIndex, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
}: {
  props: RuntimeProps; cardId: string; isActive: boolean;
  onActivate: () => void; onDone: () => void; onDelete: () => void;
  displayIndex: number;
  onDragStart: (e: React.DragEvent, i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (e: React.DragEvent, i: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}) {
  const { locals } = props;
  const scoped = scopedCardProps(props, cardId);
  const [cardType] = useFieldState(scoped, fields.cardType, '');
  const [dimensionKey] = useFieldState(scoped, fields.dimensionKey, '');
  const [value] = useFieldState(scoped, fields.value, '');
  const [customPrompt] = useFieldState(scoped, fields.customPrompt, '');
  const [statPreset] = useFieldState(scoped, fields.statPreset, '');
  const [statValuesJson] = useFieldState(scoped, fields.statValues, '{}');
  const [statUnitsJson] = useFieldState(scoped, fields.statUnits, '{}');

  const dimension: Dimension | undefined = locals.DIMENSIONS_BY_KEY[dimensionKey];
  const preset: StatPreset | undefined = locals.STAT_PRESETS_BY_KEY[statPreset];

  // Shared with DimensionSection to suppress blur-collapse during async generation
  const busyRef = useRef(false);

  // Collapsed stat summary with the user's selected units
  const statSummary = useMemo(() => {
    if (cardType !== 'stats' || !preset) return '';
    try {
      const vals = JSON.parse(statValuesJson);
      const units: Record<string, string> = JSON.parse(statUnitsJson || '{}');
      return preset.stats
        .filter(s => vals[s.key] != null)
        .map(s => {
          const activeUnit = units[s.key] || s.unit;
          return fmtStat(vals[s.key], { ...s, unit: activeUnit });
        })
        .join('  ');
    } catch { return ''; }
  }, [cardType, statValuesJson, statUnitsJson, preset]);

  return (
    <div
      className={`flex items-start gap-1 transition-colors ${isDragOver ? 'bg-blue-50 rounded' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(e, displayIndex); }}
      onDrop={e => { e.preventDefault(); onDrop(e, displayIndex); }}
    >
      {/* Drag handle */}
      <div
        draggable
        onDragStart={e => onDragStart(e, displayIndex)}
        onDragEnd={onDragEnd}
        className="w-4 shrink-0 flex items-start justify-center pt-1 cursor-grab active:cursor-grabbing select-none text-gray-200 hover:text-gray-400"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </div>

      {/* Content — blur outside this container collapses the section */}
      <div
        className="flex-1 min-w-0"
        onBlur={isActive ? (e => {
          const container = e.currentTarget;
          requestAnimationFrame(() => {
            if (!container.contains(document.activeElement) && !busyRef.current) onDone();
          });
        }) : undefined}
      >
        {isActive ? (
          <>
            {cardType === 'dimension' && dimension && (
              <DimensionSection props={props} cardId={cardId} dimension={dimension} onDone={onDone} onRemove={onDelete} busyRef={busyRef} />
            )}
            {cardType === 'bio' && (
              <FreeformSection props={props} cardId={cardId} onDone={onDone} onRemove={onDelete} />
            )}
            {cardType === 'stats' && preset && (
              <StatsSection props={props} cardId={cardId} preset={preset} onDone={onDone} onRemove={onDelete} />
            )}
          </>
        ) : (
          <CollapsedSection
            cardType={cardType}
            dimensionName={dimension?.name || dimensionKey}
            presetName={preset?.name || statPreset}
            customPrompt={customPrompt}
            value={value}
            statSummary={statSummary}
            onClick={onActivate}
          />
        )}
      </div>
    </div>
  );
}
