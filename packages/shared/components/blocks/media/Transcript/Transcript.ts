// packages/shared/components/blocks/media/Transcript/Transcript.ts
//
// Scrolling, clickable transcript on the common media contract
// (../mediaSync.ts): follows the target player's currentTime; clicking a
// cue writes seekTarget (source: 'transcript'). Attaches to any player
// by target="playerId", or shares its own bucket when composed inside
// <Video>.
//
// i18n (designed, not built): transcripts are CONTENT, so language
// variants ride the same machinery as everything else — the src
// attribute varies per content variant (foo.en.vtt / foo.es.vtt beside
// foo.en.olx / foo.es.olx), and translanguaging selects the variant by
// the user's locale exactly as it does for block text. A per-user
// language override (viewing the video in English with Spanish
// subtitles) would be one more media field ('transcriptLang') resolving
// which src to load — same getBestVariant scoring, block-local. Neither
// requires changes here beyond reading the resolved src.

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
  prototype: true,
});

export default Transcript;
