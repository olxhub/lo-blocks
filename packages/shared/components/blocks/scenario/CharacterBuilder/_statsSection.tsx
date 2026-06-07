// packages/shared/components/blocks/scenario/CharacterBuilder/_statsSection.tsx
//
// RPG-style stats card editor with unit conversion, roll mechanics,
// and currency formatting.
'use client';

import React, { useCallback, useMemo } from 'react';
import { Dices } from 'lucide-react';
import { useFieldState } from '@/lib/state';
import { scopedCardProps, resolveUnit, convertUnit, ALL_CURRENCIES } from './_helpers';
import { fields } from './CharacterBuilder';
import SectionFooter from './_sectionFooter';
import type { RuntimeProps } from '@/lib/types';
import type { StatPreset, StatDef } from '@/lib/avatar/traits';

export default function StatsSection({
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
