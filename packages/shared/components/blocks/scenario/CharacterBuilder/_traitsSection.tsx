// packages/shared/components/blocks/scenario/CharacterBuilder/_traitsSection.tsx
//
// Dimension card editor — expanded view for a single character trait.
// Includes AI-powered generation that reads other filled-in traits
// for context, with explicit anti-repetition prompting.
'use client';

import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Sparkles, Loader2 } from 'lucide-react';
import { callLLMSimple } from '@/lib/llm/reduxClient';
import { useInputField, useFieldState, updateField } from '@/lib/state';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import SectionFooter from './_sectionFooter';
import { scopedCardProps } from './_helpers';
import { fields, readCharacterState, buildYaml } from './CharacterBuilder';
import type { RuntimeProps } from '@/lib/types';
import type { Dimension, DimensionExample } from '@/lib/avatar/traits';

// ---------------------------------------------------------------------------
// DimensionSection
// ---------------------------------------------------------------------------

export default function DimensionSection({
  props, cardId, dimension, onDone, onRemove, busyRef,
}: {
  props: RuntimeProps; cardId: string; dimension: Dimension;
  onDone: () => void; onRemove: () => void;
  busyRef: React.MutableRefObject<boolean>;
}) {
  const scoped = scopedCardProps(props, cardId);
  const [value, valueProps] = useInputField(scoped, fields.value, '');
  const [characterName] = useFieldState(props, fields.characterName, '');
  // useState-ok: transient UI indicators for async LLM call, no need to persist
  const [generating, setGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState(false);

  // Read full character sheet (stats, traits, bio) for LLM context
  const characterYaml = useSelector((reduxState: any) => {
    const aeFields = props.locals.avatarEditorFields;
    const state = readCharacterState(reduxState, props, aeFields);
    return buildYaml(state.characterName, state.cards, state.avatar);
  });

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(false);
    busyRef.current = true;
    try {
      const name = characterName || 'this character';
      const examplesText = dimension.examples?.map(
        (ex: DimensionExample) => `${ex.character}: ${ex.detail}`,
      ).join('\n') || '';

      const prompt = [
        `Generate a brief, vivid ${dimension.name.toLowerCase()} description for a character named "${name}".`,
        '',
        `Dimension: ${dimension.name}`,
        dimension.prompt ? `Prompt: ${dimension.prompt}` : '',
        dimension.guidance ? `Guidance: ${dimension.guidance}` : '',
        examplesText ? `Examples:\n${examplesText}` : '',
        characterYaml ? `\nExisting character sheet (for context — be consistent but DO NOT restate):\n${characterYaml}` : '',
        '',
        value ? `Current value (generate something different): ${value}` : '',
        '',
        'Write 1-3 sentences. Be specific and vivid, not generic.',
        'Add a FRESH detail or angle for this dimension. The existing traits provide context — be consistent with them, but do not repeat, rephrase, or center on what they already say. Every dimension should reveal something new about the character.',
        'Output only the description, no labels or quotes.',
      ].filter(Boolean).join('\n');

      const result = await callLLMSimple(prompt);
      updateField(scoped, fields.value, result.trim());
    } catch (err) {
      console.warn('LLM generation failed:', err);
      setGenError(true);
    } finally {
      setGenerating(false);
      busyRef.current = false;
    }
  }, [characterName, dimension, value, scoped, characterYaml, busyRef]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{dimension.name}</h3>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-xs text-gray-400 hover:text-purple-600 disabled:text-gray-300 transition-colors"
          title="Generate with AI"
        >
          {generating
            ? <Loader2 size={12} className="inline animate-spin" />
            : <Sparkles size={12} className="inline" />
          }
          {' '}{generating ? 'generating...' : 'generate'}
        </button>
        {genError && (
          <span className="text-xs text-red-400">generation failed — try again</span>
        )}
      </div>

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
