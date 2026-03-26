// CharacterBuilder/CharacterBuilder.ts
//
// Character sheet builder — authors construct rich characters by adding,
// editing, and reordering typed cards: dimension cards (from the catalog),
// open-ended bio cards, and RPG-style stats cards with real units.
//
// State follows the Annotate pattern: dynamic items via useNextId/useSet,
// per-card scoped fields via scopeMarker, and an arrangement array for
// drag-and-drop ordering.
//
// Fields:
//   cardIds       (idField)    — counter for unique card IDs
//   cards         (setField)   — active card IDs
//   arrangement   (stateField) — ordered array of card IDs
//   activeCard    (stateField) — currently editing card ID
//   characterName (stateField) — character name (top-level, always visible)
//   draggedCard   (stateField) — drag state: index being dragged
//   dragOverIndex (stateField) — drag state: index of drop target
//   copied        (stateField) — clipboard feedback flag
//
//   Per-card (scoped by card ID via scopeMarker):
//   cardType      — 'dimension' | 'bio' | 'stats'
//   dimensionKey  — key from dimensions catalog (dimension cards)
//   value         — text content (dimension/bio cards)
//   customPrompt  — custom prompt text (bio cards)
//   statPreset    — preset key: 'dnd', 'demographics', 'custom'
//   statValues    — JSON string: {"STR": 14, "DEX": 8, ...}

import yaml from 'js-yaml';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { extendIdPrefix, scopeMarker, refToReduxKey } from '@/lib/blocks/idResolver';
import {
  DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
  STAT_PRESETS, STAT_PRESETS_BY_KEY,
} from '@/lib/avatar/traits';
import type { RuntimeProps } from '@/lib/types';
import * as parsers from '@/lib/content/parsers';
import _CharacterBuilder from './_CharacterBuilder';

export const fields = state.fields([
  state.idField('cardIds'),
  state.setField('cards'),
  'arrangement',
  'activeCard',
  'characterName',
  'draggedCard',
  'dragOverIndex',
  'copied',
  // Per-card (scoped):
  'cardType',
  'dimensionKey',
  'value',
  'customPrompt',
  'statPreset',
  'statValues',
  'statUnits',        // JSON: {"height":"cm","weight":"kg"} — selected unit per stat
]);

// ---------------------------------------------------------------------------
// YAML builder
// ---------------------------------------------------------------------------

interface CardData {
  cardType: string;
  dimensionKey: string;
  value: string;
  customPrompt: string;
  statPreset: string;
  statValues: string;
}

/** Build a character YAML from the card stack. */
function buildYaml(characterName: string, cards: CardData[]): string {
  if (!characterName && cards.length === 0) return '';

  const name = characterName || 'character';
  const member: Record<string, any> = {};

  for (const card of cards) {
    if (card.cardType === 'dimension' && card.value) {
      member[card.dimensionKey] = card.value;
    } else if (card.cardType === 'bio' && card.value) {
      const key = card.customPrompt
        ? card.customPrompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')
        : 'bio';
      member[key] = card.value;
    } else if (card.cardType === 'stats' && card.statValues) {
      try {
        const vals = JSON.parse(card.statValues);
        if (Object.keys(vals).length > 0) {
          const presetKey = card.statPreset || 'stats';
          member[presetKey] = vals;
        }
      } catch { /* invalid JSON — skip */ }
    }
  }

  if (Object.keys(member).length === 0) return `${name}:\n`;
  return yaml.dump({ [name]: member }, { lineWidth: -1, noCompatMode: true }).trimEnd();
}

// ---------------------------------------------------------------------------
// selectValue helper: read all card data from Redux
// ---------------------------------------------------------------------------

function readCardData(
  reduxState: any, props: RuntimeProps, cardId: string,
): CardData {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
  const scoped = { ...props, idPrefix };
  return {
    cardType:     fieldSelector(reduxState, scoped, fields.cardType,     { fallback: '' }),
    dimensionKey: fieldSelector(reduxState, scoped, fields.dimensionKey, { fallback: '' }),
    value:        fieldSelector(reduxState, scoped, fields.value,        { fallback: '' }),
    customPrompt: fieldSelector(reduxState, scoped, fields.customPrompt, { fallback: '' }),
    statPreset:   fieldSelector(reduxState, scoped, fields.statPreset,   { fallback: '' }),
    statValues:   fieldSelector(reduxState, scoped, fields.statValues,   { fallback: '' }),
  };
}

// ---------------------------------------------------------------------------
// Block definition
// ---------------------------------------------------------------------------

const CharacterBuilder = dev({
  ...parsers.ignore(),
  name: 'CharacterBuilder',
  description: 'Toy/prototype: Character sheet builder with dimension cards, bio, and RPG stats',
  component: _CharacterBuilder,
  fields,
  attributes: baseAttributes,
  locals: {
    buildYaml,
    DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
    STAT_PRESETS, STAT_PRESETS_BY_KEY,
  },

  selectValue: (props: RuntimeProps, reduxState: any, _reduxKey: any) => {
    const characterName = fieldSelector(reduxState, props, fields.characterName, { fallback: '' });
    const arrangement: string[] = fieldSelector(reduxState, props, fields.arrangement, { fallback: [] });

    const cardDataList = arrangement.map(cardId => readCardData(reduxState, props, cardId));
    return buildYaml(characterName, cardDataList);
  },
});

export default CharacterBuilder;
