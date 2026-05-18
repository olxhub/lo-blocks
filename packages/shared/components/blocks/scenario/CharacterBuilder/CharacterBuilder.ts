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
// TODO: State model refactor
//
// The current approach scatters character data across ~20 individual
// stateFields (plus per-card scoped fields). This makes YAML round-tripping
// hard — export works, but import requires decomposing YAML back into
// dozens of field updates.
//
// Better approach: a dictionary/map field type in the state system that
// does LWW per key (so collaboration still works). On top of that, a
// CastMember wrapper with Zod validation so you can't accidentally write
// malformed data. The card UI becomes a view over this structured object,
// and YAML import/export is trivial (yaml.load → set, get → yaml.dump).
//
// This requires extending lib/state/fieldTypes/ with a new dictField or
// jsonField type. See also: the broader authoring architecture notes in
// docs/character-development.md.
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
import { extendIdPrefix, scopeMarker } from '@/lib/types/id';
import {
  DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
  STAT_PRESETS, STAT_PRESETS_BY_KEY,
} from '@/lib/avatar/traits';
import { isCompleteHex } from '@/lib/avatar/types';
import { OPEN_PEEPS_KEYS, COLOR_PEEPS_KEYS } from '@/lib/avatar/cast';
import { fields as avatarEditorFields } from '../AvatarEditor/AvatarEditor';
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
  // Avatar (character-level, not per-card):
  'avatarMode',       // 'illustrated' | 'image' | 'emoji' — which mode is displayed
  'avatarSrc',        // image URL (image mode)
  'avatarEmoji',      // unicode character (emoji mode)
  'emojiSkinTone',    // active skin tone modifier (emoji mode)
  // Open Peeps fields live under scopeMarker('peeps') using avatarEditorFields
]);

// ---------------------------------------------------------------------------
// Data types for character state
// ---------------------------------------------------------------------------

export interface CardData {
  cardType: string;
  dimensionKey: string;
  value: string;
  customPrompt: string;
  statPreset: string;
  statValues: string;
}

export interface AvatarData {
  mode: string;
  src: string;
  emoji: string;
  seed: string;
  openPeeps: Record<string, string>;
}

export interface CharacterState {
  characterName: string;
  cards: CardData[];
  avatar: AvatarData;
}


// ---------------------------------------------------------------------------
// YAML builder
// ---------------------------------------------------------------------------

/** Build a character YAML from the card stack + avatar data.
 *  Output follows the CastMemberSchema: avatar fields at top level,
 *  character traits nested under `profile`. */
export function buildYaml(
  characterName: string, cards: CardData[], avatar?: AvatarData,
  fallbackName = 'character',
): string {
  if (!characterName && cards.length === 0 && !avatar?.mode) return '';

  const name = characterName || fallbackName;
  const member: Record<string, any> = {};

  // Avatar — persist all modes; `style` indicates which is active
  if (avatar) {
    const mode = avatar.mode || 'illustrated';
    if (mode !== 'illustrated') member.style = mode;
    if (avatar.src) member.src = avatar.src;
    if (avatar.emoji) member.emoji = avatar.emoji;
    if (avatar.seed) member.seed = avatar.seed;
    const peeps: Record<string, string> = {};
    for (const [k, v] of Object.entries(avatar.openPeeps)) {
      if (!v) continue;
      if (COLOR_PEEPS_KEYS.includes(k) && !isCompleteHex(v)) continue;
      peeps[k] = v;
    }
    if (Object.keys(peeps).length > 0) member.openPeeps = peeps;
  }

  // Cards → profile
  const profile: Record<string, any> = {};
  for (const card of cards) {
    if (card.cardType === 'dimension' && card.value) {
      profile[card.dimensionKey] = card.value;
    } else if (card.cardType === 'bio' && card.value) {
      const key = card.customPrompt
        ? card.customPrompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'bio'
        : 'bio';
      profile[key] = card.value;
    } else if (card.cardType === 'stats' && card.statValues) {
      try {
        const vals = JSON.parse(card.statValues);
        if (Object.keys(vals).length > 0) {
          const presetKey = card.statPreset || 'stats';
          profile[presetKey] = vals;
        }
      } catch { /* invalid JSON — skip */ }
    }
  }
  if (Object.keys(profile).length > 0) member.profile = profile;

  return yaml.dump({ [name]: Object.keys(member).length > 0 ? member : null },
    { lineWidth: -1, noCompatMode: true }).trimEnd();
}

// ---------------------------------------------------------------------------
// Read character state from Redux (used by selectValue and CastEditor)
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

/** Read all character data from Redux for the given props scope.
 *  Used by CharacterBuilder.selectValue and CastEditor.selectValue. */
export function readCharacterState(
  reduxState: any, props: RuntimeProps, aeFields: Record<string, any>,
): CharacterState {
  const characterName = fieldSelector(reduxState, props, fields.characterName, { fallback: '' });
  const arrangement: string[] = fieldSelector(reduxState, props, fields.arrangement, { fallback: [] });

  // Avatar data from scoped Open Peeps fields
  const avatarMode = fieldSelector(reduxState, props, fields.avatarMode, { fallback: '' });
  const avatarSrc = fieldSelector(reduxState, props, fields.avatarSrc, { fallback: '' });
  const avatarEmoji = fieldSelector(reduxState, props, fields.avatarEmoji, { fallback: '' });
  const { idPrefix: peepsPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
  const peepsScoped = { ...props, idPrefix: peepsPrefix };
  const seed = fieldSelector(reduxState, peepsScoped, aeFields.seed, { fallback: '' });
  const openPeeps: Record<string, string> = {};
  for (const k of OPEN_PEEPS_KEYS) {
    openPeeps[k] = fieldSelector(reduxState, peepsScoped, (aeFields as any)[k], { fallback: '' });
  }

  const cards = arrangement.map(cardId => readCardData(reduxState, props, cardId));

  return {
    characterName,
    cards,
    avatar: { mode: avatarMode, src: avatarSrc, emoji: avatarEmoji, seed, openPeeps },
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
  locals: {
    avatarEditorFields,
    DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
    STAT_PRESETS, STAT_PRESETS_BY_KEY,
  },

  selectValue: (props: RuntimeProps, reduxState: any, _stateKey: any) => {
    const { characterName, cards, avatar } = readCharacterState(reduxState, props, avatarEditorFields);
    return buildYaml(characterName, cards, avatar);
  },
});

export default CharacterBuilder;
