// CharacterBuilder/_CharacterBuilder.tsx
//
// Character sheet builder — authors construct rich characters by adding,
// editing, and reordering typed cards (traits, bio, stats) alongside a
// multi-mode avatar (illustrated / image / emoji).
//
// This is the root component; sub-components live in sibling files:
//   _helpers.ts       — scope helpers, stat formatting
//   _traitsSection    — dimension card editor (with AI generation)
//   _bioSection       — freeform bio card editor
//   _statsSection     — RPG stats card editor
//   _cardShell        — Section wrapper (drag handle + expand/collapse)
//   _addMenu          — multi-step card type selector
//
// Shared avatar components from components/common/:
//   AvatarBuilder     — mode tabs + OpenPeepsSelector + EmojiSelector
//   AvatarPreview     — small avatar thumbnail
//   CopyableYaml      — YAML display with copy button
'use client';

import React, { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import yaml from 'js-yaml';
import { useFieldState, useInputField, useSet, useNextId, updateField, fieldSelector } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/blocks/idResolver';
import { isCompleteHex } from '@/lib/avatar/types';
import AvatarBuilder from '@/components/common/avatar/AvatarBuilder';
import AvatarPreview from '@/components/common/avatar/AvatarPreview';
import CopyableYaml from '@/components/common/avatar/CopyableYaml';
import { scopedCardProps, peepsScopedProps } from './_helpers';
import { fields } from './CharacterBuilder';
import Section from './_cardShell';
import AddMenu from './_addMenu';
import type { RuntimeProps } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEEPS_KEYS = ['face', 'head', 'accessories', 'facialHair', 'mask', 'skinColor', 'clothingColor', 'headContrastColor'];
const COLOR_KEYS = ['skinColor', 'clothingColor', 'headContrastColor'];

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

  const pProps = peepsScopedProps(props);
  const aeFields = locals.avatarEditorFields;

  const yamlString = useYamlOutput(props, characterName, arrangement, aeFields);

  // ── Card CRUD ──
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
      {/* Character name + avatar */}
      <div className="flex items-center gap-3 mb-2">
        <input
          {...charNameProps}
          type="text"
          placeholder="Character name"
          className="text-xl font-bold border-0 border-b border-gray-200 focus:border-gray-400 outline-none flex-1 pb-1 bg-transparent"
        />
        <AvatarPreview
          props={props}
          modeField={fields.avatarMode}
          srcField={fields.avatarSrc}
          emojiField={fields.avatarEmoji}
          peepsProps={pProps}
          peepsFields={aeFields}
          characterName={characterName}
          isActive={activeCard === 'avatar'}
          onClick={() => setActiveCard(activeCard === 'avatar' ? '' : 'avatar')}
        />
      </div>

      {/* Avatar editor (expanded) */}
      {activeCard === 'avatar' && (
        <AvatarBuilder
          props={props}
          modeField={fields.avatarMode}
          srcField={fields.avatarSrc}
          emojiField={fields.avatarEmoji}
          emojiSkinToneField={fields.emojiSkinTone}
          peepsProps={pProps}
          peepsFields={aeFields}
          characterName={characterName}
          onDone={() => setActiveCard('')}
        />
      )}

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
      <CopyableYaml yaml={yamlString} props={props} copiedField={fields.copied} compact />
    </div>
  );
}

// ---------------------------------------------------------------------------
// useYamlOutput — reads all character state from Redux in one selector
// ---------------------------------------------------------------------------

function useYamlOutput(
  props: RuntimeProps, characterName: string,
  arrangement: string[], aeFields: Record<string, any>,
): string {
  const scopedList = useMemo(() =>
    arrangement.map(cardId => {
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(cardId)]);
      return { cardId, scoped: { ...props, idPrefix } as RuntimeProps };
    }),
    [arrangement, props],
  );

  const peepsMemo = useMemo(() => {
    const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker('peeps')]);
    return { ...props, idPrefix } as RuntimeProps;
  }, [props]);

  return useSelector(
    (reduxState: any) => {
      // Avatar data — always read all modes
      const avatarMode = fieldSelector(reduxState, props, fields.avatarMode, { fallback: '' });
      const avatarSrc = fieldSelector(reduxState, props, fields.avatarSrc, { fallback: '' });
      const avatarEmoji = fieldSelector(reduxState, props, fields.avatarEmoji, { fallback: '' });
      const seed = fieldSelector(reduxState, peepsMemo, aeFields.seed, { fallback: '' });
      const openPeeps: Record<string, string> = {};
      for (const k of PEEPS_KEYS) {
        openPeeps[k] = fieldSelector(reduxState, peepsMemo, (aeFields as any)[k], { fallback: '' });
      }

      const hasAvatar = avatarMode || avatarSrc || avatarEmoji || seed ||
        Object.values(openPeeps).some(v => !!v);
      if (!characterName && arrangement.length === 0 && !hasAvatar) return '';

      const name = characterName || 'character';
      const member: Record<string, any> = {};

      // Avatar → YAML (persist all modes; `style` picks which is active)
      const mode = avatarMode || 'illustrated';
      if (mode !== 'illustrated') member.style = mode;
      if (avatarSrc) member.src = avatarSrc;
      if (avatarEmoji) member.emoji = avatarEmoji;
      if (seed) member.seed = seed;
      const peeps: Record<string, string> = {};
      for (const [k, v] of Object.entries(openPeeps)) {
        if (!v) continue;
        if (COLOR_KEYS.includes(k) && !isCompleteHex(v)) continue;
        peeps[k] = v;
      }
      if (Object.keys(peeps).length > 0) member.openPeeps = peeps;

      // Cards → profile
      const profile: Record<string, any> = {};
      for (const { scoped } of scopedList) {
        const cardType = fieldSelector(reduxState, scoped, fields.cardType, { fallback: '' });
        const val = fieldSelector(reduxState, scoped, fields.value, { fallback: '' });
        const dimKey = fieldSelector(reduxState, scoped, fields.dimensionKey, { fallback: '' });
        const customPrompt = fieldSelector(reduxState, scoped, fields.customPrompt, { fallback: '' });
        const statPreset = fieldSelector(reduxState, scoped, fields.statPreset, { fallback: '' });
        const svJson = fieldSelector(reduxState, scoped, fields.statValues, { fallback: '{}' });

        if (cardType === 'dimension' && val && dimKey) {
          profile[dimKey] = val;
        } else if (cardType === 'bio' && val) {
          const bioKey = customPrompt
            ? customPrompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'bio'
            : 'bio';
          profile[bioKey] = val;
        } else if (cardType === 'stats' && svJson !== '{}') {
          try {
            const vals = JSON.parse(svJson);
            if (Object.keys(vals).length > 0) profile[statPreset || 'stats'] = vals;
          } catch { /* skip */ }
        }
      }
      if (Object.keys(profile).length > 0) member.profile = profile;

      if (Object.keys(member).length === 0) return `${name}:\n`;
      return yaml.dump({ [name]: member }, { lineWidth: -1, noCompatMode: true }).trimEnd();
    },
    (a: string, b: string) => a === b,
  );
}
