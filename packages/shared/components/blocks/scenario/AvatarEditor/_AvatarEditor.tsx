// packages/shared/components/blocks/scenario/AvatarEditor/_AvatarEditor.tsx
//
// Standalone avatar editor — thin wrapper around OpenPeepsSelector.
// Lets authors build a single cast member's appearance + metadata,
// then copy the resulting YAML.
//
// For the multi-mode avatar picker (illustrated/image/emoji), see
// components/common/AvatarBuilder.tsx.
'use client';

import React from 'react';
import { useSelector } from 'react-redux';
import { useFieldState, useInputField, fieldSelector, decodeField } from '@/lib/state';
import { isValidCastIdInput, isValidGroupInput } from '@/lib/avatar/types';
import { OPEN_PEEPS_KEYS } from '@/lib/avatar/cast';
import OpenPeepsSelector from '@/components/common/avatar/OpenPeepsSelector';
import CopyableYaml from '@/components/common/avatar/CopyableYaml';
import type { RuntimeProps } from '@/lib/types';

function _AvatarEditor(props: RuntimeProps) {
  const { fields, locals } = props;
  const compact = props.compact;

  // --- Metadata fields (need values + setters for form inputs) ---
  const [characterId, characterIdInputProps] = useInputField(
    props, fields.characterId, '', { updateValidator: isValidCastIdInput },
  );
  const [name, setName] = useFieldState(props, fields.name, '');
  const [role, setRole] = useFieldState(props, fields.role, '');
  const [bio, setBio] = useFieldState(props, fields.bio, '');
  const [groups, groupsInputProps] = useInputField(
    props, fields.groups, '', { updateValidator: isValidGroupInput },
  );

  // --- YAML output (reads all fields from Redux in one selector) ---
  // OpenPeepsSelector manages the peeps hooks internally; we only need
  // the values here for YAML serialization, not for the picker UI.
  const yamlOutput = useSelector((reduxState: any) => {
    const cid = fieldSelector(reduxState, props, fields.characterId, { fallback: '' });
    const nm = fieldSelector(reduxState, props, fields.name, { fallback: '' });
    const sd = fieldSelector(reduxState, props, fields.seed, { fallback: '' });
    const fv: Record<string, string> = {};
    for (const k of OPEN_PEEPS_KEYS) {
      fv[k] = fieldSelector(reduxState, props, fields[k], { fallback: '' });
    }
    const rl = fieldSelector(reduxState, props, fields.role, { fallback: '' });
    const bi = decodeField(fields.bio, fieldSelector(reduxState, props, fields.bio, { fallback: '' }));
    const gr = fieldSelector(reduxState, props, fields.groups, { fallback: '' });
    return locals.buildYaml(cid, nm, sd, fv, { role: rl, bio: bi, groups: gr });
  });

  return (
    <div className="avatar-editor border rounded-lg bg-white p-4 space-y-4">
      {/* --- ID input --- */}
      <div className="flex-shrink-0">
        <input
          {...characterIdInputProps}
          type="text"
          placeholder="ID (e.g. robert)"
          className="w-40 border rounded px-2 py-1 text-sm font-mono"
        />
      </div>

      {/* --- Avatar picker: preview + tabs --- */}
      <OpenPeepsSelector
        props={props}
        fields={fields}
        characterName={characterId}
        previewSize={160}
      />

      {/* --- Metadata + YAML (hidden in compact mode) --- */}
      {!compact && (
        <>
          <details className="border rounded">
            <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer bg-gray-50 hover:bg-gray-100">
              Metadata
            </summary>
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Name</label>
                  <input
                    type="text"
                    placeholder="Display name (if different from ID)"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Data Analysis Intern"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Bio</label>
                <textarea
                  placeholder="Short character biography"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Groups</label>
                <input
                  {...groupsInputProps}
                  type="text"
                  placeholder="e.g. interns,team_a"
                  className="w-full border rounded px-2 py-1 text-sm font-mono"
                />
              </div>
            </div>
          </details>

          <CopyableYaml yaml={yamlOutput} props={props} copiedField={fields.copied} />
        </>
      )}
    </div>
  );
}

export default _AvatarEditor;
