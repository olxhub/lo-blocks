// packages/shared/components/blocks/display/Video/Video.ts
//
// Video playback with a synchronized, clickable transcript — the Open
// edX video experience on this platform's field system
// (docs/video-block-design.md).
//
// Sync architecture is intent-based (design doc Option C): the PLAYER is
// the only writer of currentTime; everything else — transcript clicks,
// scrubbers, other blocks, the state language — writes seekTarget, and
// the player applies it. Single-writer discipline eliminates the races;
// seekSource preserves provenance for analytics (did the seek come from
// the transcript, a chapter link, a keyboard?).
//
// currentTime is an ENCODED field (the encode axis): local state tracks
// playback tick-by-tick, but the wire and the event log see one
// aggregate {startTs, endTs, samples} event per quiet period — and
// replay expands the samples back out, so scrubbing a session replay
// moves through the video timeline sample by sample.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';

export const fields = state.fields([
  // Where the video actually is. Written by the player ONLY.
  { name: 'currentTime', encode: { debounceMs: 5000, maxPoints: 100 } },
  // Where someone wants it to be. Written by everyone EXCEPT the player.
  'seekTarget',
  'seekSource',
  // Playback state — plain LWW; these change at human speed.
  'playing',
  'playbackRate',
  'duration',
]);

const attributes = z.object({
  src: z.string().describe('Video URL (e.g. /content/lecture.mp4)'),
  poster: z.string().optional().describe('Image shown before playback starts'),
  transcript: z.string().optional()
    .describe('WebVTT subtitle URL — enables the synchronized transcript panel'),
  transcriptLang: z.string().optional()
    .describe('BCP 47 language of the transcript track (default en)'),
});

const Video = core({
  ...parsers.ignore(),
  name: 'Video',
  description: 'Video player with synchronized, clickable transcript (WebVTT).',
  fields,
  attributes,
});

export default Video;
