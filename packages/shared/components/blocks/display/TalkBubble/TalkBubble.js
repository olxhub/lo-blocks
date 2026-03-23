// src/components/blocks/display/TalkBubble/TalkBubble.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { Face, withCastSupport } from '@/lib/cast';
import _TalkBubble from './_TalkBubble';

const TalkBubble = core({
  ...withCastSupport(parsers.blocks()),
  name: 'TalkBubble',
  description: 'Displays dialogue with an avatar image and speech bubble, commonly used in SBA conversations',
  component: _TalkBubble,
  attributes: baseAttributes.extend({
    ...cast,
    speaker: z.string().optional().describe('Name of the speaker (looked up in cast)'),
    avatar: z.string().optional().describe('Image URL for avatar (overrides cast)'),
    seed: z.string().optional().describe('Override seed for DiceBear avatar generation'),
    face: Face.optional().describe('DiceBear face/expression (e.g. smile, serious, angry)'),
    avatarStyle: z.enum(['illustrated', 'initials']).optional().describe('Avatar rendering style (defaults to cast style or illustrated)'),
    position: z.enum(['left', 'right']).default('left').describe('Position of avatar (left or right)'),
  }),
  category: 'display'
});

export default TalkBubble;
