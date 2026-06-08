// packages/shared/components/blocks/scenario/CharacterBuilder/_CharacterBuilder.tsx
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

import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useFieldState, useInputField, useSet, useNextId, updateField } from '@/lib/state';
import AvatarBuilder from '@/components/common/avatar/AvatarBuilder';
import AvatarPreview from '@/components/common/avatar/AvatarPreview';
import CopyableYaml from '@/components/common/avatar/CopyableYaml';
import { scopedCardProps, peepsScopedProps } from './_helpers';
import { fields, readCharacterState, buildYaml } from './CharacterBuilder';
import Section from './_cardShell';
import AddMenu from './_addMenu';
import type { RuntimeProps } from '@/lib/types';

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

  const yamlString = useYamlOutput(props);

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

function useYamlOutput(props: RuntimeProps): string {
  const aeFields = props.locals.avatarEditorFields;
  return useSelector(
    (reduxState: any) => {
      const { characterName, cards, avatar } = readCharacterState(reduxState, props, aeFields);
      return buildYaml(characterName, cards, avatar);
    },
    (a: string, b: string) => a === b,
  );
}
