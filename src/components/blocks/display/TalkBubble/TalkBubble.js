// src/components/blocks/display/TalkBubble/TalkBubble.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import _TalkBubble from './_TalkBubble';

const TalkBubbleAttributes = baseAttributes.extend({
  speaker: z.string().optional().describe('Name of the speaker'),
  avatar: z.string().optional().describe('Path or identifier for avatar image'),
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
