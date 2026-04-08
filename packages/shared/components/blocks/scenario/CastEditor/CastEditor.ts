// CastEditor/CastEditor.ts
//
// Cast-of-characters editor — manages a collection of characters,
// each with its own avatar, traits, bio, and stats.
//
// Uses the same data flow pattern as CharacterBuilder:
//   idField + setField + arrangement for the member list,
//   scopeMarker per member for isolated character state.
//
// The embedded CharacterBuilder component resolves all its state
// from props.idPrefix, so scoping it under #memberN just works:
//
//   castEditor:#member1:characterName     — member 1's name
//   castEditor:#member1:#card5:value      — member 1's card 5
//   castEditor:#member1:#peeps:face       — member 1's avatar
//
// Output: full cast YAML (all members combined).

import yaml from 'js-yaml';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { extendIdPrefix, scopeMarker } from '@/lib/blocks/idResolver';
import {
  DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
  STAT_PRESETS, STAT_PRESETS_BY_KEY,
} from '@/lib/avatar/traits';
import { fields as avatarEditorFields } from '../AvatarEditor/AvatarEditor';
import {
  fields as characterBuilderFields,
  readCharacterState, buildYaml as buildCharacterYaml,
} from '../CharacterBuilder/CharacterBuilder';
import type { RuntimeProps } from '@/lib/types';
import * as parsers from '@/lib/content/parsers';
import _CastEditor from './_CastEditor';

export const fields = state.fields([
  state.idField('memberIds'),
  state.setField('members'),
  'arrangement',
  'activeMember',
  'copied',
]);

const CastEditor = dev({
  ...parsers.ignore(),
  name: 'CastEditor',
  description: 'Toy/prototype: Cast-of-characters editor — build a full cast with avatars, traits, and profiles',
  component: _CastEditor,
  fields,
  locals: {
    // CastEditor's own field refs
    characterBuilderFields,
    avatarEditorFields,
    // Pass through to embedded CharacterBuilder
    DIMENSIONS, DIMENSIONS_BY_KEY, DIMENSION_CATEGORIES,
    STAT_PRESETS, STAT_PRESETS_BY_KEY,
  },

  selectValue: (props: RuntimeProps, reduxState: any, _reduxKey: any) => {
    const arrangement: string[] = fieldSelector(reduxState, props, fields.arrangement, { fallback: [] });
    if (arrangement.length === 0) return '';

    const cast: Record<string, any> = {};

    for (let i = 0; i < arrangement.length; i++) {
      const memberId = arrangement[i];
      const { idPrefix } = extendIdPrefix(props, [props.id, scopeMarker(memberId)]);
      const memberProps = { ...props, idPrefix } as RuntimeProps;

      const { characterName, cards, avatar } = readCharacterState(
        reduxState, memberProps, avatarEditorFields,
      );

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
});

export default CastEditor;
