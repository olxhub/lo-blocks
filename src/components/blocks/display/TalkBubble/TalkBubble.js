// src/components/blocks/display/TalkBubble/TalkBubble.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import _TalkBubble from './_TalkBubble';

const TalkBubbleAttributes = baseAttributes.extend({
  speaker: z.string().optional().describe('Name of the speaker'),
  avatar: z.string().optional().describe('Image URL for avatar (overrides generated avatar)'),
  seed: z.string().optional().describe('Override seed for DiceBear avatar generation'),
  face: z.string().optional().describe('DiceBear face/expression (e.g. smile, serious, angry)'),
  avatarStyle: z.enum(['illustrated', 'initials']).default('illustrated').describe('Avatar rendering style'),
  position: z.enum(['left', 'right']).default('left').describe('Position of avatar (left or right)'),
});

const TalkBubble = core({
  ...parsers.blocks(),
  name: 'TalkBubble',
  description: 'Displays dialogue with an avatar image and speech bubble, commonly used in SBA conversations',
  component: _TalkBubble,
  attributes: TalkBubbleAttributes,
  category: 'display'
});

export default TalkBubble;
