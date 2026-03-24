// src/components/blocks/display/TalkBubble/TalkBubble.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, cast, character } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { withCastSupport } from '@/lib/avatar/cast';
import _TalkBubble from './_TalkBubble';

const TalkBubble = core({
  ...withCastSupport(parsers.blocks()),
  name: 'TalkBubble',
  description: 'Displays dialogue with an avatar image and speech bubble, commonly used in SBA conversations',
  component: _TalkBubble,
  attributes: baseAttributes.extend({
    ...cast,
    ...character,
    position: z.enum(['left', 'right']).default('left').describe('Position of avatar (left or right)'),
  }),
  category: 'display'
});

export default TalkBubble;
