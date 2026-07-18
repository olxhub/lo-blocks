// packages/shared/components/blocks/scenario/CharacterBuilder/CharacterBuilder.ts
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
import { decodedFieldSelector, docField } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/types/id-grammar';
import {
  DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
  STAT_PRESETS, STAT_PRESETS_BY_KEY,
} from '@/lib/avatar/traits';
import { isCompleteHex } from '@/lib/avatar/types';
import { OPEN_PEEPS_KEYS, COLOR_PEEPS_KEYS } from '@/lib/avatar/cast';
import { fields as avatarEditorFields } from '../AvatarEditor/AvatarEditor';
import type { RuntimeProps } from '@/lib/types';
import * as parsers from '@/lib/content/parsers';

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
  docField('value'),
  docField('customPrompt'),
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
// Read character state from Redux (used by selectors.value and CastEditor)
// ---------------------------------------------------------------------------

function readCardData(
  reduxState: any, props: RuntimeProps, cardId: string,
): CardData {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
  const scoped = { ...props, idPrefix };
  return {
    cardType:     decodedFieldSelector(reduxState, scoped, fields.cardType,     { fallback: '' }),
    dimensionKey: decodedFieldSelector(reduxState, scoped, fields.dimensionKey, { fallback: '' }),
    value:        decodedFieldSelector(reduxState, scoped, fields.value,        { fallback: '' }),
    customPrompt: decodedFieldSelector(reduxState, scoped, fields.customPrompt, { fallback: '' }),
    statPreset:   decodedFieldSelector(reduxState, scoped, fields.statPreset,   { fallback: '' }),
    statValues:   decodedFieldSelector(reduxState, scoped, fields.statValues,   { fallback: '' }),
  };
}

/** Read all character data from Redux for the given props scope.
 *  Used by CharacterBuilder's and CastEditor's selectors.value. */
export function readCharacterState(
  reduxState: any, props: RuntimeProps, aeFields: Record<string, any>,
): CharacterState {
  const characterName = decodedFieldSelector(reduxState, props, fields.characterName, { fallback: '' });
  const arrangement: string[] = decodedFieldSelector(reduxState, props, fields.arrangement, { fallback: [] });

  // Avatar data from scoped Open Peeps fields
  const avatarMode = decodedFieldSelector(reduxState, props, fields.avatarMode, { fallback: '' });
  const avatarSrc = decodedFieldSelector(reduxState, props, fields.avatarSrc, { fallback: '' });
  const avatarEmoji = decodedFieldSelector(reduxState, props, fields.avatarEmoji, { fallback: '' });
  const { idPrefix: peepsPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
  const peepsScoped = { ...props, idPrefix: peepsPrefix };
  const seed = decodedFieldSelector(reduxState, peepsScoped, aeFields.seed, { fallback: '' });
  const openPeeps: Record<string, string> = {};
  for (const k of OPEN_PEEPS_KEYS) {
    openPeeps[k] = decodedFieldSelector(reduxState, peepsScoped, (aeFields as any)[k], { fallback: '' });
  }

  const cards = arrangement.map(cardId => readCardData(reduxState, props, cardId));

  return {
    characterName,
    cards,
    avatar: { mode: avatarMode, src: avatarSrc, emoji: avatarEmoji, seed, openPeeps },
  };
}

// ---------------------------------------------------------------------------
// Pipelined value getter: flatten / rebuild pair
// ---------------------------------------------------------------------------
// The value getter uses the {deps, compute} FieldSelector form: deps is the
// flat, shallow-comparable projection of every read the YAML depends on
// (primitives only — the deps contract demands cheap, reference-stable
// entries); compute rebuilds the structure and runs buildYaml post-gate.
// CARD_DEP_KEYS is the order contract between the two halves.

const CARD_DEP_KEYS = [
  'cardType', 'dimensionKey', 'value', 'customPrompt', 'statPreset', 'statValues',
] as const satisfies readonly (keyof CardData)[];

/** deps half: every field read, flattened to primitives in a fixed order. */
function characterDeps(
  reduxState: any, props: RuntimeProps, aeFields: Record<string, any>,
): unknown[] {
  const { characterName, cards, avatar } = readCharacterState(reduxState, props, aeFields);
  return [
    characterName, avatar.mode, avatar.src, avatar.emoji, avatar.seed,
    ...OPEN_PEEPS_KEYS.map(k => avatar.openPeeps[k]),
    ...cards.flatMap(card => CARD_DEP_KEYS.map(k => card[k])),
  ];
}

/** compute half: rebuild the structure characterDeps flattened, then serialize. */
function computeCharacterYaml(...deps: unknown[]): string {
  const [characterName, mode, src, emoji, seed, ...rest] = deps as string[];
  const openPeeps = Object.fromEntries(OPEN_PEEPS_KEYS.map((k, i) => [k, rest[i]]));
  const cardValues = rest.slice(OPEN_PEEPS_KEYS.length);
  const cards: CardData[] = [];
  for (let i = 0; i < cardValues.length; i += CARD_DEP_KEYS.length) {
    cards.push(Object.fromEntries(
      CARD_DEP_KEYS.map((k, j) => [k, cardValues[i + j]]),
    ) as unknown as CardData);
  }
  return buildYaml(characterName, cards, { mode, src, emoji, seed, openPeeps });
}

// ---------------------------------------------------------------------------
// Block definition
// ---------------------------------------------------------------------------

const CharacterBuilder = dev({
  ...parsers.ignore(),
  name: 'CharacterBuilder',
  description: 'Toy/prototype: Character sheet builder with dimension cards, bio, and RPG stats',
  fields,
  locals: {
    avatarEditorFields,
    DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
    STAT_PRESETS, STAT_PRESETS_BY_KEY,
  },

  selectors: {
    // Pipelined getter ({deps, compute} — see FieldSelector in types/core.ts):
    // deps flattens every field read into a shallow-comparable primitive
    // array, which subscribers gate on; compute rebuilds the structure and
    // serializes only when something actually changed.
    value: {
      deps: (reduxState: any, props: RuntimeProps, _stateKey: any) =>
        characterDeps(reduxState, props, avatarEditorFields),
      compute: computeCharacterYaml,
    },
  },
});

export default CharacterBuilder;
