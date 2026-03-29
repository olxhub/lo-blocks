// src/components/blocks/scenario/AvatarEditor/AvatarEditor.ts

import yaml from 'js-yaml';
import * as parsers from '@/lib/content/parsers';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { baseAttributes, z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import {
  isValidCastIdInput, isValidGroupInput, isValidHexInput, isCompleteHex,
} from '@/lib/avatar/types';
import _AvatarEditor from './_AvatarEditor';

export const fields = state.fields([
  'characterId',     // Cast key (e.g. "robert", "Łukasz")
  'name',            // Display name (e.g. "Robert Dole")
  'seed',            // Avatar generation seed
  'activeTab',       // Currently visible picker tab
  'face',            // Face expression
  'head',            // Hair/hat style
  'accessories',     // Glasses, eyepatch, etc.
  'facialHair',      // Beard/moustache style
  'mask',            // Medical mask, respirator
  'skinColor',          // Hex color (6 digits, no #)
  'clothingColor',      // Hex color (6 digits, no #)
  'headContrastColor',  // Hair/hat color, hex (6 digits, no #)
  'role',               // Profile: character role/title
  'bio',                // Profile: character bio
  'groups',             // Comma-separated group slugs
  'copied',             // Transient: copy-to-clipboard feedback
]);

const COLOR_KEYS = ['skinColor', 'clothingColor', 'headContrastColor'];

/** Build a cast member object and dump it as YAML. */
function buildYaml(
  characterId: string, name: string, seed: string,
  fieldValues: Record<string, string>,
  profile: { role: string; bio: string; groups: string },
): string {
  const id = characterId || 'character';
  const member: Record<string, any> = {};

  // Only include name if it differs from the ID
  if (name && name !== id) member.name = name;
  if (seed) member.seed = seed;

  // openPeeps — only include fields with values; colors must be complete hex
  const peepsKeys = ['face', 'head', 'accessories', 'facialHair', 'mask', ...COLOR_KEYS];
  const openPeeps: Record<string, string> = {};
  for (const key of peepsKeys) {
    const val = fieldValues[key];
    if (!val) continue;
    if (COLOR_KEYS.includes(key) && !isCompleteHex(val)) continue;
    openPeeps[key] = val;
  }
  if (Object.keys(openPeeps).length > 0) member.openPeeps = openPeeps;

  // profile
  const profileObj: Record<string, string> = {};
  if (profile.role) profileObj.role = profile.role;
  if (profile.bio) profileObj.bio = profile.bio;
  if (Object.keys(profileObj).length > 0) member.profile = profileObj;

  // groups — split on commas
  const groupList = profile.groups.split(',').map(t => t.trim()).filter(Boolean);
  if (groupList.length > 0) member.groups = groupList;

  return yaml.dump({ [id]: member }, { lineWidth: -1, noCompatMode: true }).trimEnd();
}

const AvatarEditor = dev({
  ...parsers.ignore(),
  name: 'AvatarEditor',
  description: 'Toy/prototype: Visual avatar editor for picking Open Peeps features',
  component: _AvatarEditor,
  fields,
  attributes: baseAttributes.extend({
    compact: z_olx_boolean.optional(),
  }),
  locals: { buildYaml, isValidCastIdInput, isValidGroupInput, isValidHexInput },

  selectValue: (props: any, reduxState: any, _reduxKey: any) => {
    const characterId = fieldSelector(reduxState, props, fields.characterId, { fallback: '' });
    const name = fieldSelector(reduxState, props, fields.name, { fallback: '' });
    const seed = fieldSelector(reduxState, props, fields.seed, { fallback: '' });
    const face = fieldSelector(reduxState, props, fields.face, { fallback: '' });
    const head = fieldSelector(reduxState, props, fields.head, { fallback: '' });
    const accessories = fieldSelector(reduxState, props, fields.accessories, { fallback: '' });
    const facialHair = fieldSelector(reduxState, props, fields.facialHair, { fallback: '' });
    const mask = fieldSelector(reduxState, props, fields.mask, { fallback: '' });
    const skinColor = fieldSelector(reduxState, props, fields.skinColor, { fallback: '' });
    const clothingColor = fieldSelector(reduxState, props, fields.clothingColor, { fallback: '' });
    const headContrastColor = fieldSelector(reduxState, props, fields.headContrastColor, { fallback: '' });
    const role = fieldSelector(reduxState, props, fields.role, { fallback: '' });
    const bio = fieldSelector(reduxState, props, fields.bio, { fallback: '' });
    const groups = fieldSelector(reduxState, props, fields.groups, { fallback: '' });
    return buildYaml(
      characterId, name, seed,
      { face, head, accessories, facialHair, mask, skinColor, clothingColor, headContrastColor },
      { role, bio, groups },
    );
  },
});

export default AvatarEditor;
