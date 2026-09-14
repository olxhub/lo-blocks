// packages/shared/components/blocks/input/NumberLineInput/tickHelpers.ts
//
// Tick discovery (render side) and tick validation (parse side) for
// NumberLineInput. Kept out of the blueprint's own file so both the
// blueprint and the component can use it without either importing the other.
//
import { getBlockByDefinitionRef } from '@/lib/blocks';
import { isKidArray } from '@/lib/types/kids';
import type { RuntimeProps } from '@/lib/types';

export interface TickInfo {
  /** The tick's position, and the value stored when it is chosen. */
  value: number;
  /** What a screen reader says at this position: label=, else the tick's
   *  own text with Markdown markers removed. May be empty (an image-only
   *  tick with no label and no alt text of its own). */
  text: string;
}

/** Markdown markers removed, for an accessible-name string. Deliberately
 *  simple: emphasis/heading/code markers go, link and image text stays. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All the text under a kids structure, in document order. */
function textFromKids(props: RuntimeProps, kids: any): string {
  if (typeof kids === 'string') return kids;
  if (!isKidArray(kids)) return '';
  return kids.map(k => {
    if (typeof k === 'string') return k;
    if (k.type === 'text') return typeof k.text === 'string' ? k.text : '';
    if (k.type === 'html') return textFromKids(props, k.kids);
    if (k.type !== 'block') return '';
    const inst = getBlockByDefinitionRef(props, k.definitionKey);
    return inst ? textFromKids(props, inst.kids) : '';
  }).filter(Boolean).join(' ');
}

/**
 * The Tick children of a NumberLineInput, in ascending value order.
 *
 * Static: reads the parsed kids and the block index, so it gives the same
 * answer in the component, in a selector, and in a test.
 */
export function getTicks(props: RuntimeProps): TickInfo[] {
  const kids = props.kids;
  if (!isKidArray(kids)) return [];
  const ticks: TickInfo[] = [];
  for (const kid of kids) {
    if (!kid || (kid as any).type !== 'block') continue;
    const inst = getBlockByDefinitionRef(props, (kid as any).definitionKey);
    if (!inst || inst.tag !== 'Tick') continue;
    const value = Number(inst.attributes?.value);
    if (!Number.isFinite(value)) continue;
    const label = inst.attributes?.label;
    ticks.push({
      value,
      text: typeof label === 'string' && label !== ''
        ? label
        : stripMarkdown(textFromKids(props, inst.kids)),
    });
  }
  return ticks.sort((a, b) => a.value - b.value);
}

/** The tick closest to `value`; the earlier one on a tie. */
export function nearestTick(ticks: TickInfo[], value: number): TickInfo | null {
  if (ticks.length === 0) return null;
  return ticks.reduce((best, tick) =>
    Math.abs(tick.value - value) < Math.abs(best.value - value) ? tick : best);
}

/**
 * Parse-time check of the <Tick> children against this line's own range.
 *
 * Runs from NumberLineInput's parser, which is the only place that sees both
 * the parent's parsed attributes and the children (validateChildren gets
 * kids and the idMap, but no attributes). Throws, so a bad line becomes an
 * ErrorNode with the message rather than a silently wrong scale.
 */
export function validateRawTicks(
  { rawParsed, tag, attributes }: { rawParsed: any; tag: string; attributes: any }
): void {
  const rawKids = rawParsed?.[tag];
  if (!Array.isArray(rawKids)) return;

  const { min, max } = attributes;
  const seen = new Map<number, number>();

  for (const kid of rawKids) {
    if (!kid || typeof kid !== 'object' || kid.Tick === undefined) continue;
    const raw = kid[':@']?.value;
    const value = Number(raw);
    // A missing or unparseable value= is the Tick's own schema error.
    if (raw === undefined || !Number.isFinite(value)) continue;

    if (value < min || value > max) {
      throw new Error(
        `<Tick value="${raw}"> lies outside the line's range (min="${min}" max="${max}").`
      );
    }
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }

  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  if (duplicates.length > 0) {
    throw new Error(
      `Two <Tick> children share the same value (${duplicates.join(', ')}); each tick needs its own position.`
    );
  }
}
