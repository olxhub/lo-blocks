// packages/shared/components/blocks/media/Transcript/Transcript.ts
//
// Scrolling, clickable transcript on the common media contract
// (../mediaSync.ts): follows the target player's currentTime; clicking a
// cue writes seekTarget (source: 'transcript'). Attaches to any player
// by target="playerId", or shares its own bucket when composed inside
// <Video>.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { mediaFields } from '../mediaSync';

export const fields = mediaFields;

const attributes = z.object({
  src: z.string().describe('WebVTT transcript URL'),
  target: z.string().optional()
    .describe('Id of the player block to follow/control (default: own bucket — the composed case)'),
});

const Transcript = core({
  ...parsers.ignore(),
  name: 'Transcript',
  description: 'Synchronized, clickable transcript (WebVTT) for any media player.',
  fields,
  attributes,
});

export default Transcript;
