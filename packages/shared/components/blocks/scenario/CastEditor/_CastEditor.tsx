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
import { useFieldState, useSet, useNextId } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/blocks/idResolver';
import AvatarPreview from '@/components/common/avatar/AvatarPreview';
import CopyableYaml from '@/components/common/avatar/CopyableYaml';
import _CharacterBuilder from '../CharacterBuilder/_CharacterBuilder';
import {
  fields as characterBuilderFields,
  readCharacterState, buildYaml as buildCharacterYaml,
} from '../CharacterBuilder/CharacterBuilder';
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

function useCastYaml(props: RuntimeProps, arrangement: string[]): string {
  const aeFields = props.locals.avatarEditorFields;

  const memberScopes = useMemo(() =>
    arrangement.map(memberId => {
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(memberId)]);
      return { memberId, mProps: { ...props, idPrefix } as RuntimeProps };
    }),
    [arrangement, props],
  );

  return useSelector(
    (reduxState: any) => {
      if (arrangement.length === 0) return '';

      const cast: Record<string, any> = {};

      for (let i = 0; i < memberScopes.length; i++) {
        const { mProps } = memberScopes[i];
        const { characterName, cards, avatar } = readCharacterState(reduxState, mProps, aeFields);
        const memberYaml = buildCharacterYaml(characterName, cards, avatar, `character_${i + 1}`);
        if (!memberYaml) continue;

        try {
          const parsed = yaml.load(memberYaml) as Record<string, any>;
          if (parsed && typeof parsed === 'object') {
            Object.assign(cast, parsed);
          }
        } catch (err) { console.warn('CastEditor: malformed member YAML:', err); }
      }

      if (Object.keys(cast).length === 0) return '';
      return yaml.dump(cast, { lineWidth: -1, noCompatMode: true }).trimEnd();
    },
    (a: string, b: string) => a === b,
  );
}
