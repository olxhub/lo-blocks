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
//   cards         (orSetField) — active card IDs
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
//   text          — text content (dimension/bio cards)
//   customPrompt  — custom prompt text (bio cards)
//   statPreset    — preset key: 'dnd', 'demographics', 'custom'
//   statValues    — JSON string: {"STR": 14, "DEX": 8, ...}

import yaml from 'js-yaml';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, selectFields, docField } from '@/lib/state';
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
  state.orSetField('cards'),
  'arrangement',
  'activeCard',
  'characterName',
  'draggedCard',
  'dragOverIndex',
  'copied',
  // Per-card (scoped):
  'cardType',
  'dimensionKey',
  // Named `text`, not `value`: a per-sub-scope internal field must not share
  // a name with the block-level `value` getter — idPrefix scoping shares the
  // blueprint, so the getter would mask the card field in every card scope.
  docField('text'),
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
  // Cross-field reads compose at level 3 (selectFields = plural
  // fieldSelector). The `text` field feeds the composite's `value` slot.
  const r = selectFields(reduxState, scoped, [
    fields.cardType, fields.dimensionKey, fields.text,
    fields.customPrompt, fields.statPreset, fields.statValues,
  ], { fallback: '' });
  return {
    cardType: r.cardType, dimensionKey: r.dimensionKey, value: r.text,
    customPrompt: r.customPrompt, statPreset: r.statPreset, statValues: r.statValues,
  };
}

/** Read all character data from Redux for the given props scope.
 *  Used by CharacterBuilder's and CastEditor's selectors.value. */
export function readCharacterState(
  reduxState: any, props: RuntimeProps, aeFields: Record<string, any>,
): CharacterState {
  // Cross-field reads compose at level 3; arrangement reads individually
  // (distinct fallback).
  const { characterName, avatarMode, avatarSrc, avatarEmoji } = selectFields(
    reduxState, props,
    [fields.characterName, fields.avatarMode, fields.avatarSrc, fields.avatarEmoji],
    { fallback: '' },
  );
  const arrangement: string[] = fieldSelector(reduxState, props, fields.arrangement, { fallback: [] });

  // Avatar data from scoped Open Peeps fields
  const { idPrefix: peepsPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
  const peepsScoped = { ...props, idPrefix: peepsPrefix };
  const seed = fieldSelector(reduxState, peepsScoped, aeFields.seed, { fallback: '' });
  const openPeeps: Record<string, string> = selectFields(
    reduxState, peepsScoped, OPEN_PEEPS_KEYS.map(k => (aeFields as any)[k]), { fallback: '' },
  );

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
// Value setter: YAML → field fan-out (inverse of the getter)
// ---------------------------------------------------------------------------

/**
 * Inverse of buildYaml: parse a single-member CastMemberSchema YAML back into
 * CharacterState. Blank input is the empty character (buildYaml of an empty
 * builder is ''). Anything else malformed — unparsable YAML, a non-object
 * root, multiple members — THROWS: setters fail fast rather than half-apply.
 *
 * Round-trip law: setField(props, field, getField(props, field)) leaves the
 * observable value unchanged, modulo field defaults and canonicalization
 * (an omitted `style` reads back as '' rather than 'illustrated' — buildYaml
 * treats both as illustrated; openPeeps keys re-serialize in the canonical
 * OPEN_PEEPS_KEYS order the getter reads them in).
 */
export function parseCharacterYaml(yamlText: string): CharacterState {
  const empty: CharacterState = {
    characterName: '',
    cards: [],
    avatar: { mode: '', src: '', emoji: '', seed: '', openPeeps: {} },
  };
  if (!yamlText.trim()) return empty;

  const root = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('CharacterBuilder value: expected a single-member character YAML mapping');
  }
  const names = Object.keys(root);
  if (names.length !== 1) {
    throw new Error(`CharacterBuilder value: expected exactly one character, got ${names.length}`);
  }
  const characterName = names[0];
  const member = (root as Record<string, any>)[characterName];
  if (member !== null && (typeof member !== 'object' || Array.isArray(member))) {
    throw new Error(`CharacterBuilder value: character '${characterName}' must be a mapping`);
  }
  const m = member ?? {};

  const openPeeps: Record<string, string> = {};
  for (const k of OPEN_PEEPS_KEYS) {
    const v = m.openPeeps?.[k];
    if (typeof v === 'string' && v) openPeeps[k] = v;
  }

  const cards: CardData[] = [];
  for (const [key, val] of Object.entries((m.profile ?? {}) as Record<string, any>)) {
    const blank = { cardType: '', dimensionKey: '', value: '', customPrompt: '', statPreset: '', statValues: '' };
    if ((DIMENSIONS_BY_KEY as Record<string, unknown>)[key]) {
      cards.push({ ...blank, cardType: 'dimension', dimensionKey: key, value: String(val ?? '') });
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      cards.push({ ...blank, cardType: 'stats', statPreset: key, statValues: JSON.stringify(val) });
    } else {
      cards.push({ ...blank, cardType: 'bio', customPrompt: key === 'bio' ? '' : key, value: String(val ?? '') });
    }
  }

  return {
    characterName,
    cards,
    avatar: {
      mode: typeof m.style === 'string' ? m.style : '',
      src: typeof m.src === 'string' ? m.src : '',
      emoji: typeof m.emoji === 'string' ? m.emoji : '',
      seed: typeof m.seed === 'string' ? m.seed : '',
      openPeeps,
    },
  };
}

/**
 * Fan a parsed CharacterState out to the backing fields characterDeps reads:
 * name, avatar scalars, peeps-scoped avatar fields, arrangement, per-card
 * fields (CARD_DEP_KEYS order contract). Existing card ids are reused
 * positionally so their unlisted state (statUnits) survives; extra incoming
 * cards get setter-namespaced ids (distinct from the counter-minted UI ids).
 */
function writeCharacterState(parsed: CharacterState, props: RuntimeProps): void {
  state.updateField(props, fields.characterName, parsed.characterName);
  state.updateField(props, fields.avatarMode, parsed.avatar.mode);
  state.updateField(props, fields.avatarSrc, parsed.avatar.src);
  state.updateField(props, fields.avatarEmoji, parsed.avatar.emoji);

  const { idPrefix: peepsPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
  const peepsScoped = { ...props, idPrefix: peepsPrefix };
  state.updateField(peepsScoped, avatarEditorFields.seed, parsed.avatar.seed);
  for (const k of OPEN_PEEPS_KEYS) {
    state.updateField(peepsScoped, (avatarEditorFields as any)[k], parsed.avatar.openPeeps[k] ?? '');
  }

  const existing: string[] = state.getField(props, fields.arrangement, { fallback: [] });
  const arrangement = parsed.cards.map((_, i) => existing[i] ?? `card_yaml_${i + 1}`);
  for (let i = 0; i < parsed.cards.length; i++) {
    const card = parsed.cards[i];
    const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(arrangement[i])]);
    const scoped = { ...props, idPrefix };
    state.updateField(scoped, fields.cardType, card.cardType);
    state.updateField(scoped, fields.dimensionKey, card.dimensionKey);
    state.updateField(scoped, fields.text, card.value);
    state.updateField(scoped, fields.customPrompt, card.customPrompt);
    state.updateField(scoped, fields.statPreset, card.statPreset);
    state.updateField(scoped, fields.statValues, card.statValues);
  }
  state.updateField(props, fields.arrangement, arrangement);
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

  setters: {
    // The getter's inverse (see parseCharacterYaml for the round-trip law):
    // parse the YAML, fan out to the backing fields the getter reads.
    // `value` is purely derived — without this setter, writes would be the
    // fail-fast error setField/updateField throw for derived fields.
    value: (yamlText: any, props: RuntimeProps, _stateKey: any) => {
      writeCharacterState(parseCharacterYaml(String(yamlText ?? '')), props);
    },
  },
});

export default CharacterBuilder;
