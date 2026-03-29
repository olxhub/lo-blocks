// CastEditor/_CastEditor.tsx
//
// Cast-of-characters editor UI.
//
// Top: member tab bar with avatar thumbnails + add button.
// Middle: the active member's CharacterBuilder (rendered with scoped props).
// Bottom: full cast YAML output.
//
// This follows the same data flow pattern used throughout the system:
// idField + setField + arrangement for the member list, scopeMarker
// for per-member state isolation. The embedded _CharacterBuilder
// component resolves all its state from props.idPrefix.
'use client';

import React, { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import yaml from 'js-yaml';
import { Plus, X } from 'lucide-react';
import { useFieldState, useSet, useNextId, updateField, fieldSelector } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/blocks/idResolver';
import { isCompleteHex } from '@/lib/avatar/types';
import AvatarPreview from '@/components/common/avatar/AvatarPreview';
import CopyableYaml from '@/components/common/avatar/CopyableYaml';
import _CharacterBuilder from '../CharacterBuilder/_CharacterBuilder';
import { fields as characterBuilderFields } from '../CharacterBuilder/CharacterBuilder';
import { fields } from './CastEditor';
import type { RuntimeProps } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function memberScopedProps(props: RuntimeProps, memberId: string): RuntimeProps {
  const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(memberId)]);
  return { ...props, idPrefix, runtime: { ...props.runtime, idPrefix } };
}

// ---------------------------------------------------------------------------
// Member tab (avatar thumbnail + name)
// ---------------------------------------------------------------------------

function MemberTab({
  props, memberId, isActive, onClick, onRemove,
}: {
  props: RuntimeProps; memberId: string; isActive: boolean;
  onClick: () => void; onRemove: () => void;
}) {
  const mProps = memberScopedProps(props, memberId);
  const aeFields = props.locals.avatarEditorFields;

  const [characterName] = useFieldState(mProps, characterBuilderFields.characterName, '');

  // Scoped props for the member's Open Peeps fields
  const peepsProps = useMemo(() => {
    const { idPrefix } = extendIdPrefix(mProps, [mProps.id, scopeMarker('peeps')]);
    return { ...mProps, idPrefix, runtime: { ...mProps.runtime, idPrefix } };
  }, [mProps]);

  const displayName = characterName || `Character ${memberId}`;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-t border border-b-0 cursor-pointer transition-colors ${
        isActive
          ? 'bg-white border-gray-300 -mb-px z-10'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      }`}
      onClick={onClick}
    >
      <AvatarPreview
        props={mProps}
        modeField={characterBuilderFields.avatarMode}
        srcField={characterBuilderFields.avatarSrc}
        emojiField={characterBuilderFields.avatarEmoji}
        peepsProps={peepsProps}
        peepsFields={aeFields}
        characterName={characterName}
        size={24}
      />
      <span className={`text-sm truncate max-w-[8rem] ${
        isActive ? 'font-medium text-gray-800' : 'text-gray-600'
      }`}>
        {displayName}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="text-gray-300 hover:text-red-500 transition-colors ml-auto"
        title="Remove character"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function _CastEditor(props: RuntimeProps) {
  const { locals } = props;

  const members = useSet(props, fields.members);
  const nextId = useNextId(props, fields.memberIds);
  const [arrangement, setArrangement] = useFieldState(props, fields.arrangement, []);
  const [activeMember, setActiveMember] = useFieldState(props, fields.activeMember, '');

  // ── Member CRUD ──
  const addMember = useCallback(() => {
    const memberId = nextId();
    members.add(memberId);
    setArrangement([...arrangement, memberId]);
    setActiveMember(memberId);
  }, [nextId, members, arrangement, setArrangement, setActiveMember]);

  const removeMember = useCallback((memberId: string) => {
    if (!window.confirm('Remove this character? All their data will be lost.')) return;
    members.del(memberId);
    setArrangement(arrangement.filter((id: string) => id !== memberId));
    if (activeMember === memberId) {
      const remaining = arrangement.filter((id: string) => id !== memberId);
      setActiveMember(remaining[0] || '');
    }
  }, [members, arrangement, setArrangement, activeMember, setActiveMember]);

  // ── YAML output (full cast) ──
  const yamlString = useCastYaml(props, arrangement);

  // Active member's scoped props
  const activeMemberProps = useMemo(() => {
    if (!activeMember) return null;
    return memberScopedProps(props, activeMember);
  }, [props, activeMember]);

  return (
    <div className="cast-editor max-w-2xl">
      {/* Member tabs */}
      <div className="flex items-end gap-0.5 flex-wrap">
        {arrangement.map((memberId: string) => (
          <MemberTab
            key={memberId}
            props={props}
            memberId={memberId}
            isActive={activeMember === memberId}
            onClick={() => setActiveMember(activeMember === memberId ? '' : memberId)}
            onRemove={() => removeMember(memberId)}
          />
        ))}
        <button
          onClick={addMember}
          className="flex items-center gap-1 px-2 py-1.5 rounded-t border border-b-0 border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm text-gray-500 transition-colors"
          title="Add character"
        >
          <Plus size={14} />
          {arrangement.length === 0 ? 'Add character' : ''}
        </button>
      </div>

      {/* Active member's CharacterBuilder */}
      {activeMemberProps && (
        <div className="border border-gray-300 rounded-b rounded-tr p-3 bg-white">
          <_CharacterBuilder {...activeMemberProps} />
        </div>
      )}

      {/* Empty state */}
      {arrangement.length === 0 && (
        <div className="border border-gray-200 rounded-b p-8 text-center text-gray-400 text-sm">
          Add characters to build your cast.
        </div>
      )}

      {/* Full cast YAML */}
      <CopyableYaml yaml={yamlString} props={props} copiedField={fields.copied} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// useCastYaml — reads all member data from Redux
// ---------------------------------------------------------------------------

const PEEPS_KEYS = ['face', 'head', 'accessories', 'facialHair', 'mask', 'skinColor', 'clothingColor', 'headContrastColor'];
const COLOR_KEYS = ['skinColor', 'clothingColor', 'headContrastColor'];

function useCastYaml(props: RuntimeProps, arrangement: string[]): string {
  const aeFields = props.locals.avatarEditorFields;

  const memberScopes = useMemo(() =>
    arrangement.map(memberId => {
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(memberId)]);
      const mProps = { ...props, idPrefix } as RuntimeProps;
      const { idPrefix: peepsPrefix } = extendIdPrefix(mProps, [mProps.id, scopeMarker('peeps')]);
      return { memberId, mProps, peepsProps: { ...mProps, idPrefix: peepsPrefix } as RuntimeProps };
    }),
    [arrangement, props],
  );

  return useSelector(
    (reduxState: any) => {
      if (arrangement.length === 0) return '';

      const cast: Record<string, any> = {};

      for (const { mProps, peepsProps } of memberScopes) {
        const characterName = fieldSelector(reduxState, mProps, characterBuilderFields.characterName, { fallback: '' });
        const memberArrangement: string[] = fieldSelector(reduxState, mProps, characterBuilderFields.arrangement, { fallback: [] });

        // Avatar
        const avatarMode = fieldSelector(reduxState, mProps, characterBuilderFields.avatarMode, { fallback: '' });
        const avatarSrc = fieldSelector(reduxState, mProps, characterBuilderFields.avatarSrc, { fallback: '' });
        const avatarEmoji = fieldSelector(reduxState, mProps, characterBuilderFields.avatarEmoji, { fallback: '' });
        const seed = fieldSelector(reduxState, peepsProps, aeFields.seed, { fallback: '' });
        const openPeeps: Record<string, string> = {};
        for (const k of PEEPS_KEYS) {
          openPeeps[k] = fieldSelector(reduxState, peepsProps, (aeFields as any)[k], { fallback: '' });
        }

        const name = characterName || 'character';
        const member: Record<string, any> = {};

        // Avatar → YAML
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
        for (const cardId of memberArrangement) {
          const { idPrefix: cardPrefix } = extendIdPrefix(mProps, [mProps.id, scopeMarker(cardId)]);
          const scoped = { ...mProps, idPrefix: cardPrefix };
          const cardType = fieldSelector(reduxState, scoped, characterBuilderFields.cardType, { fallback: '' });
          const val = fieldSelector(reduxState, scoped, characterBuilderFields.value, { fallback: '' });
          const dimKey = fieldSelector(reduxState, scoped, characterBuilderFields.dimensionKey, { fallback: '' });
          const customPrompt = fieldSelector(reduxState, scoped, characterBuilderFields.customPrompt, { fallback: '' });
          const statPreset = fieldSelector(reduxState, scoped, characterBuilderFields.statPreset, { fallback: '' });
          const svJson = fieldSelector(reduxState, scoped, characterBuilderFields.statValues, { fallback: '{}' });

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

        if (Object.keys(member).length > 0 || characterName) {
          cast[name] = member;
        }
      }

      if (Object.keys(cast).length === 0) return '';
      return yaml.dump(cast, { lineWidth: -1, noCompatMode: true }).trimEnd();
    },
    (a: string, b: string) => a === b,
  );
}
