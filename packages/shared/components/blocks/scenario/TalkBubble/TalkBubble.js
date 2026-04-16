// src/components/blocks/display/TalkBubble/TalkBubble.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { cast, character } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { withCastSupport } from '@/lib/avatar/cast';
import _TalkBubble from './_TalkBubble';

const TalkBubble = core({
  ...withCastSupport(parsers.blocks()),
  name: 'TalkBubble',
  description: 'Displays dialogue with an avatar image and speech bubble, commonly used in SBA conversations',
  component: _TalkBubble,
  attributes: z.object({
    ...cast,
    ...character,
    side: z.enum(['primary', 'secondary']).default('primary').describe('Conversation side (primary=default side, secondary=opposite)'),
  }).strict(),

});

export default TalkBubble;
