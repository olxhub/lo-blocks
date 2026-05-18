// CharacterBuilder/_helpers.ts
//
// Shared helpers for CharacterBuilder sub-components.
// Scoping, formatting, and unit conversion.

import { extendIdPrefix, scopeMarker } from '@/lib/types/id-grammar';
import type { RuntimeProps } from '@/lib/types';
import type { StatDef, UnitOption } from '@/lib/avatar/traits';

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/** Create scoped props for a per-card field set. */
export function scopedCardProps(props: RuntimeProps, cardId: string): RuntimeProps {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

/** Scoped props for Open Peeps avatar fields (uses AvatarEditor field defs). */
export function peepsScopedProps(props: RuntimeProps): RuntimeProps {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

// ---------------------------------------------------------------------------
// Stat formatting & unit conversion
// ---------------------------------------------------------------------------

/** All ISO 4217 currency codes from the runtime. */
export const ALL_CURRENCIES: string[] = (() => {
  try { return (Intl as any).supportedValuesOf('currency') as string[]; }
  catch { return ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'KRW', 'INR', 'BRL', 'MXN']; }
})();

/** Format inches as feet'inches" (e.g., 65 → 5'5"). */
export function inchesToFeetInches(inches: number): string {
  const totalInches = Math.round(inches);
  const ft = Math.floor(totalInches / 12);
  const rem = totalInches % 12;
  if (ft === 0) return `${rem}"`;
  if (rem === 0) return `${ft}'`;
  return `${ft}'${rem}"`;
}

/** Format a stat value for collapsed display. */
export function fmtStat(value: number, stat: StatDef, locale = 'en'): string {
  if (stat.currency) {
    try {
      const formatted = new Intl.NumberFormat(locale, {
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

/** Resolve the active unit info for a stat given the user's unit selection. */
export function resolveUnit(stat: StatDef, selectedUnit: string | undefined) {
  if (!selectedUnit || selectedUnit === stat.unit || !stat.altUnits) {
    return { unit: stat.unit, min: stat.min, max: stat.max, step: stat.step, alt: null as UnitOption | null };
  }
  const alt = stat.altUnits.find(a => a.unit === selectedUnit);
  if (!alt) return { unit: stat.unit, min: stat.min, max: stat.max, step: stat.step, alt: null };
  return { unit: alt.unit, min: alt.min, max: alt.max, step: alt.step, alt };
}

/** Convert a value between two units of the same stat. */
export function convertUnit(value: number, stat: StatDef, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value;
  const fromAlt = stat.altUnits?.find(a => a.unit === fromUnit);
  const base = fromAlt ? fromAlt.toBase(value) : value;
  const toAlt = stat.altUnits?.find(a => a.unit === toUnit);
  const raw = toAlt ? toAlt.fromBase(base) : base;
  const { min, max, step } = toAlt || { min: stat.min, max: stat.max, step: stat.step };
  return Math.round(Math.max(min, Math.min(max, raw)) / step) * step;
}
