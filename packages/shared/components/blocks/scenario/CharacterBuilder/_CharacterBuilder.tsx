// CharacterBuilder/_CharacterBuilder.tsx
//
// V4: Unified state (menu + active card share one field), proper stats
// display with units, YAML output using fieldSelector.
'use client';

import React, { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import yaml from 'js-yaml';
import { Copy, Check, Plus, Dices, GripVertical } from 'lucide-react';
import { useFieldState, useInputField, useSet, useNextId, updateField, fieldSelector } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/blocks/idResolver';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import { fields } from './CharacterBuilder';

import type { RuntimeProps } from '@/lib/types';
import type {
  Dimension, DimensionCategory, DimensionExample,
  StatPreset, StatDef, UnitOption,
} from '@/lib/avatar/traits';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopedCardProps(props: RuntimeProps, cardId: string): RuntimeProps {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

/** All ISO 4217 currency codes from the runtime. */
const ALL_CURRENCIES: string[] = (() => {
  try { return (Intl as any).supportedValuesOf('currency') as string[]; }
  catch { return ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'KRW', 'INR', 'BRL', 'MXN']; }
})();

/** Format inches as feet'inches" (e.g., 65 → 5'5"). */
function inchesToFeetInches(inches: number): string {
  const ft = Math.floor(inches / 12);
  const rem = Math.round(inches % 12);
  if (ft === 0) return `${rem}"`;
  if (rem === 0) return `${ft}'`;
  return `${ft}'${rem}"`;
}

/** Format a stat value for collapsed display. */
function fmtStat(value: number, stat: StatDef): string {
  if (stat.currency) {
    try {
      const formatted = new Intl.NumberFormat('en', {
        style: 'currency', currency: stat.unit, maximumFractionDigits: 0,
      }).format(value);
      return `${stat.key}\u00a0${formatted}`;
    } catch { return `${stat.key}\u00a0${value}`; }
  }
  if (stat.feetInches && stat.unit === 'in') {
    return `${stat.key}\u00a0${inchesToFeetInches(value)}`;
  }
  const fv = Math.abs(value) >= 10000 ? `${Math.round(value / 1000)}k` : String(value);
  if (stat.unit) return `${stat.key}\u00a0${fv}\u00a0${stat.unit}`;
  return `${stat.key}\u00a0${fv}`;
}

// ---------------------------------------------------------------------------
// Section footer: Done + Remove
// ---------------------------------------------------------------------------

function SectionFooter({ onDone, onRemove, hasContent }: {
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

// ---------------------------------------------------------------------------
// Dimension section (expanded)
// Order: title → prompt → textarea → guidance → examples → actions
// ---------------------------------------------------------------------------

function DimensionSection({
  props, cardId, dimension, onDone, onRemove,
}: {
  props: RuntimeProps; cardId: string; dimension: Dimension;
  onDone: () => void; onRemove: () => void;
}) {
  const scoped = scopedCardProps(props, cardId);
  const [value, valueProps] = useInputField(scoped, fields.value, '');

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-gray-800">{dimension.name}</h3>

      <div className="text-sm text-gray-500 italic">
        <RenderMarkdown>{dimension.prompt}</RenderMarkdown>
      </div>

      <textarea
        {...valueProps}
        placeholder={`Describe this character's ${dimension.name.toLowerCase()}...`}
        rows={3}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-y min-h-[3rem] focus:border-blue-400 focus:outline-none"
      />

      {dimension.guidance && (
        <details open className="text-sm">
          <summary className="text-amber-700 cursor-pointer hover:text-amber-900 font-medium text-xs uppercase tracking-wide select-none">
            Guidance
          </summary>
          <div className="mt-1 text-sm text-gray-600">
            <RenderMarkdown>{dimension.guidance}</RenderMarkdown>
          </div>
        </details>
      )}

      {dimension.examples && dimension.examples.length > 0 && (
        <details open className="text-sm">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-700 font-medium text-xs uppercase tracking-wide select-none">
            Examples
          </summary>
          <div className="mt-1 space-y-1.5 pl-3 border-l-2 border-gray-100">
            {dimension.examples.map((ex: DimensionExample, i: number) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-gray-700">{ex.character}:</span>{' '}
                <span className="text-gray-500">{ex.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <SectionFooter onDone={onDone} onRemove={onRemove} hasContent={!!value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Freeform section (expanded) — custom question + freeform text
// ---------------------------------------------------------------------------

function FreeformSection({
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

// ---------------------------------------------------------------------------
// Stats section (expanded)
// Vertical list, full stat names, unit selector with conversion.
// Values are stored in the currently selected unit. Switching units converts.
// ---------------------------------------------------------------------------

/** Resolve the active unit info for a stat given the user's unit selection. */
function resolveUnit(stat: StatDef, selectedUnit: string | undefined) {
  if (!selectedUnit || selectedUnit === stat.unit || !stat.altUnits) {
    return { unit: stat.unit, min: stat.min, max: stat.max, step: stat.step, alt: null as UnitOption | null };
  }
  const alt = stat.altUnits.find(a => a.unit === selectedUnit);
  if (!alt) return { unit: stat.unit, min: stat.min, max: stat.max, step: stat.step, alt: null };
  return { unit: alt.unit, min: alt.min, max: alt.max, step: alt.step, alt };
}

/** Convert a value between two units of the same stat. */
function convertUnit(value: number, stat: StatDef, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  // from → base
  const fromAlt = stat.altUnits?.find(a => a.unit === fromUnit);
  const base = fromAlt ? fromAlt.toBase(value) : value;
  // base → to
  const toAlt = stat.altUnits?.find(a => a.unit === toUnit);
  const raw = toAlt ? toAlt.fromBase(base) : base;
  // clamp + round
  const { min, max, step } = toAlt || { min: stat.min, max: stat.max, step: stat.step };
  return Math.round(Math.max(min, Math.min(max, raw)) / step) * step;
}

function StatsSection({
  props, cardId, preset, onDone, onRemove,
}: {
  props: RuntimeProps; cardId: string; preset: StatPreset;
  onDone: () => void; onRemove: () => void;
}) {
  const scoped = scopedCardProps(props, cardId);
  const [statValuesJson, setStatValuesJson] = useFieldState(scoped, fields.statValues, '{}');
  const [statUnitsJson, setStatUnitsJson] = useFieldState(scoped, fields.statUnits, '{}');

  const statValues: Record<string, number> = useMemo(() => {
    try { return JSON.parse(statValuesJson) || {}; } catch { return {}; }
  }, [statValuesJson]);

  const statUnits: Record<string, string> = useMemo(() => {
    try { return JSON.parse(statUnitsJson) || {}; } catch { return {}; }
  }, [statUnitsJson]);

  const updateStat = useCallback((key: string, value: number) => {
    setStatValuesJson(JSON.stringify({ ...statValues, [key]: value }));
  }, [statValues, setStatValuesJson]);

  const switchUnit = useCallback((stat: StatDef, newUnit: string) => {
    const oldUnit = statUnits[stat.key] || stat.unit;
    setStatUnitsJson(JSON.stringify({ ...statUnits, [stat.key]: newUnit }));
    // Convert stored value for physical units; currency just changes the label
    if (!stat.currency && statValues[stat.key] != null) {
      const converted = convertUnit(statValues[stat.key], stat, oldUnit, newUnit);
      setStatValuesJson(JSON.stringify({ ...statValues, [stat.key]: converted }));
    }
  }, [statValues, statUnits, setStatValuesJson, setStatUnitsJson]);

  const rollStat = useCallback((stat: StatDef) => {
    const baseValue = stat.roll();
    const selectedUnit = statUnits[stat.key] || stat.unit;
    const { alt } = resolveUnit(stat, selectedUnit);
    if (alt) {
      const raw = alt.fromBase(baseValue);
      updateStat(stat.key, Math.round(Math.max(alt.min, Math.min(alt.max, raw)) / alt.step) * alt.step);
    } else {
      updateStat(stat.key, baseValue);
    }
  }, [statUnits, updateStat]);

  const rollAll = useCallback(() => {
    const next: Record<string, number> = {};
    for (const stat of preset.stats) {
      const baseValue = stat.roll();
      const selectedUnit = statUnits[stat.key] || stat.unit;
      const { alt } = resolveUnit(stat, selectedUnit);
      if (alt) {
        const raw = alt.fromBase(baseValue);
        next[stat.key] = Math.round(Math.max(alt.min, Math.min(alt.max, raw)) / alt.step) * alt.step;
      } else {
        next[stat.key] = baseValue;
      }
    }
    setStatValuesJson(JSON.stringify(next));
  }, [preset, statUnits, setStatValuesJson]);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{preset.name}</h3>
        <button
          onClick={rollAll}
          className="text-xs text-gray-400 hover:text-gray-600"
          title="Roll all stats"
        >
          <Dices size={12} className="inline -mt-0.5" /> roll all
        </button>
      </div>

      <div className="space-y-0.5">
        {preset.stats.map(stat => {
          const selectedUnit = statUnits[stat.key] || stat.unit;
          const { unit, min, max, step } = resolveUnit(stat, selectedUnit);
          const isCurrency = stat.currency;
          const hasAlts = !isCurrency && stat.altUnits && stat.altUnits.length > 0;

          return (
            <div key={stat.key} className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 shrink-0 w-28">{stat.name}</span>
              <div className="flex items-center gap-0.5">
                {isCurrency && (
                  <select
                    value={selectedUnit}
                    onChange={e => switchUnit(stat, e.target.value)}
                    className="text-xs text-gray-400 bg-transparent border-0 cursor-pointer focus:outline-none pr-0"
                  >
                    {ALL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {stat.feetInches && unit === 'in' ? (
                  <>
                    <input
                      type="number"
                      value={statValues[stat.key] != null ? Math.floor(statValues[stat.key] / 12) : ''}
                      onChange={e => {
                        if (e.target.value === '') return;
                        const ft = Number(e.target.value);
                        const curIn = Math.round((statValues[stat.key] || 0) % 12);
                        updateStat(stat.key, ft * 12 + curIn);
                      }}
                      min={0} max={7} step={1}
                      className="w-14 border-b border-gray-200 px-1 py-0 text-sm font-mono text-right bg-transparent focus:border-blue-400 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400 select-none">&prime;</span>
                    <input
                      type="number"
                      value={statValues[stat.key] != null ? Math.round(statValues[stat.key] % 12) : ''}
                      onChange={e => {
                        if (e.target.value === '') return;
                        const inVal = Number(e.target.value);
                        const curFt = Math.floor((statValues[stat.key] || 0) / 12);
                        updateStat(stat.key, curFt * 12 + inVal);
                      }}
                      min={0} max={11} step={1}
                      className="w-14 border-b border-gray-200 px-1 py-0 text-sm font-mono text-right bg-transparent focus:border-blue-400 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400 select-none">&Prime;</span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      value={statValues[stat.key] ?? ''}
                      onChange={e => { if (e.target.value !== '') updateStat(stat.key, Number(e.target.value)); }}
                      min={min} max={max} step={step}
                      className="w-24 border-b border-gray-200 px-1 py-0 text-sm font-mono text-right bg-transparent focus:border-blue-400 focus:outline-none"
                    />
                    {!isCurrency && !hasAlts && unit && <span className="text-xs text-gray-400">{unit}</span>}
                  </>
                )}
                {hasAlts && (
                  <select
                    value={selectedUnit}
                    onChange={e => switchUnit(stat, e.target.value)}
                    className="text-xs text-gray-400 bg-transparent border-0 cursor-pointer focus:outline-none"
                  >
                    <option value={stat.unit}>{stat.unit}</option>
                    {stat.altUnits!.map(a => <option key={a.unit} value={a.unit}>{a.unit}</option>)}
                  </select>
                )}
              </div>
              <button
                onClick={() => rollStat(stat)}
                className="text-gray-300 hover:text-gray-500"
                title={`Roll ${stat.name}`}
              >
                <Dices size={10} />
              </button>
            </div>
          );
        })}
      </div>

      <SectionFooter onDone={onDone} onRemove={onRemove} hasContent={statValuesJson !== '{}'} />
    </div>
  );
}

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

  const preview = cardType === 'stats'
    ? statSummary
    : value
      ? (value.length > 120 ? value.slice(0, 120) + '\u2026' : value)
      : '';

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

function Section({
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
          if (!e.currentTarget.contains(e.relatedTarget as Node)) onDone();
        }) : undefined}
      >
        {isActive ? (
          <>
            {cardType === 'dimension' && dimension && (
              <DimensionSection props={props} cardId={cardId} dimension={dimension} onDone={onDone} onRemove={onDelete} />
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

// ---------------------------------------------------------------------------
// Add section menu
// Menu state is encoded in activeCard as 'menu:type', 'menu:dimension',
// 'menu:stats'. This ensures only one thing is open at a time.
// ---------------------------------------------------------------------------

function AddMenu({
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

// ---------------------------------------------------------------------------
// YAML output
// ---------------------------------------------------------------------------

function YamlOutput({ yamlStr, props }: { yamlStr: string; props: RuntimeProps }) {
  const [copied, setCopied] = useFieldState(props, fields.copied, false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yamlStr).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
    ).catch(() => {});
  }, [yamlStr, setCopied]);

  if (!yamlStr) return null;

  return (
    <div className="relative mt-3">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
        title="Copy YAML"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre className="bg-gray-50 rounded px-2 py-1.5 text-xs font-mono text-gray-600 whitespace-pre overflow-x-auto">
        {yamlStr}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function _CharacterBuilder(props: RuntimeProps) {
  const { locals } = props;

  const cards = useSet(props, fields.cards);
  const nextId = useNextId(props, fields.cardIds);
  const [arrangement, setArrangement] = useFieldState(props, fields.arrangement, []);
  const [activeCard, setActiveCard] = useFieldState(props, fields.activeCard, '');
  const [characterName, charNameProps] = useInputField(props, fields.characterName, '');
  const [draggedCard, setDraggedCard] = useFieldState(props, fields.draggedCard, null);
  const [dragOverIndex, setDragOverIndex] = useFieldState(props, fields.dragOverIndex, null);

  const yamlString = useYamlOutput(props, characterName, arrangement);

  // ── Card creation (sets activeCard to the new card, closing menu + other cards) ──
  const addCard = useCallback((cardType: string, extra: Record<string, string> = {}) => {
    const cardId = nextId();
    cards.add(cardId);
    const scoped = scopedCardProps(props, cardId);
    updateField(scoped, fields.cardType, cardType);
    for (const [key, value] of Object.entries(extra)) {
      const field = (fields as any)[key];
      if (field) updateField(scoped, field, value);
    }
    setArrangement([...arrangement, cardId]);
    setActiveCard(cardId);
  }, [nextId, cards, props, arrangement, setArrangement, setActiveCard]);

  const addDimension = useCallback((key: string) => addCard('dimension', { dimensionKey: key }), [addCard]);
  const addBio = useCallback(() => addCard('bio'), [addCard]);
  const addStats = useCallback((key: string) => addCard('stats', { statPreset: key }), [addCard]);

  const deleteCard = useCallback((cardId: string) => {
    cards.del(cardId);
    setArrangement(arrangement.filter((id: string) => id !== cardId));
    if (activeCard === cardId) setActiveCard('');
  }, [cards, arrangement, setArrangement, activeCard, setActiveCard]);

  // ── Drag and drop ──
  const handleDragStart = useCallback((e: React.DragEvent, i: number) => {
    setDraggedCard(i); e.dataTransfer.effectAllowed = 'move';
  }, [setDraggedCard]);

  const handleDragOver = useCallback((e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (draggedCard !== null && i !== draggedCard) setDragOverIndex(i);
  }, [draggedCard, setDragOverIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedCard === null) return;
    const arr = [...arrangement];
    const item = arr.splice(draggedCard, 1)[0];
    arr.splice(dropIndex, 0, item);
    setArrangement(arr);
    setDraggedCard(null); setDragOverIndex(null);
  }, [draggedCard, arrangement, setArrangement, setDraggedCard, setDragOverIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null); setDragOverIndex(null);
  }, [setDraggedCard, setDragOverIndex]);

  return (
    <div className="character-builder max-w-2xl">
      {/* Character name */}
      <input
        {...charNameProps}
        type="text"
        placeholder="Character name"
        className="text-xl font-bold border-0 border-b border-gray-200 focus:border-gray-400 outline-none w-full pb-1 mb-2 bg-transparent"
      />

      {/* Sections */}
      <div className="divide-y divide-gray-100">
        {arrangement.map((cardId: string, i: number) => (
          <div key={cardId} className="py-1.5">
            <Section
              props={props}
              cardId={cardId}
              isActive={activeCard === cardId}
              onActivate={() => setActiveCard(activeCard === cardId ? '' : cardId)}
              onDone={() => setActiveCard('')}
              onDelete={() => deleteCard(cardId)}
              displayIndex={i}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              isDragOver={dragOverIndex === i}
            />
          </div>
        ))}
      </div>

      {/* Add section menu */}
      <div className="mt-2">
        <AddMenu
          activeCard={activeCard}
          setActiveCard={setActiveCard}
          onAddDimension={addDimension}
          onAddBio={addBio}
          onAddStats={addStats}
          locals={locals}
        />
      </div>

      {/* YAML output */}
      <YamlOutput yamlStr={yamlString} props={props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// useYamlOutput — uses fieldSelector for correct Redux key resolution
// ---------------------------------------------------------------------------

function useYamlOutput(props: RuntimeProps, characterName: string, arrangement: string[]): string {
  // Pre-compute scoped props for each card (stable across renders if arrangement is stable)
  const scopedList = useMemo(() =>
    arrangement.map(cardId => {
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
      return { cardId, scoped: { ...props, idPrefix } as RuntimeProps };
    }),
    [arrangement, props],
  );

  return useSelector(
    (reduxState: any) => {
      if (!characterName && arrangement.length === 0) return '';

      const name = characterName || 'character';
      const member: Record<string, any> = {};

      for (const { scoped } of scopedList) {
        const cardType = fieldSelector(reduxState, scoped, fields.cardType, { fallback: '' });
        const val = fieldSelector(reduxState, scoped, fields.value, { fallback: '' });
        const dimKey = fieldSelector(reduxState, scoped, fields.dimensionKey, { fallback: '' });
        const customPrompt = fieldSelector(reduxState, scoped, fields.customPrompt, { fallback: '' });
        const statPreset = fieldSelector(reduxState, scoped, fields.statPreset, { fallback: '' });
        const svJson = fieldSelector(reduxState, scoped, fields.statValues, { fallback: '{}' });

        if (cardType === 'dimension' && val && dimKey) {
          member[dimKey] = val;
        } else if (cardType === 'bio' && val) {
          const bioKey = customPrompt
            ? customPrompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')
            : 'bio';
          member[bioKey] = val;
        } else if (cardType === 'stats' && svJson !== '{}') {
          try {
            const vals = JSON.parse(svJson);
            if (Object.keys(vals).length > 0) member[statPreset || 'stats'] = vals;
          } catch { /* skip */ }
        }
      }

      if (Object.keys(member).length === 0) return `${name}:\n`;
      return yaml.dump({ [name]: member }, { lineWidth: -1, noCompatMode: true }).trimEnd();
    },
    (a: string, b: string) => a === b,
  );
}
