// packages/shared/components/blocks/media/VideoPlayer/VideoPlayer.ts
//
// JUST the video element, speaking the common media contract
// (../mediaSync.ts): the player is the only writer of currentTime and
// the applier of everyone else's intent (seekTarget, playing).
// Companions — <Transcript target=…/>, scrubbers, analytics — attach by
// state key; the composed <Video> block wraps this with a transcript.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { mediaFields, mediaLocals } from '../mediaSync';

export const fields = mediaFields;

const attributes = z.object({
  src: z.string().describe('Video URL (e.g. /content/lecture.mp4)'),
  poster: z.string().optional().describe('Image shown before playback starts'),
});

const VideoPlayer = core({
  ...parsers.ignore(),
  name: 'VideoPlayer',
  description: 'Bare video element on the shared media-sync contract; compose with Transcript or use <Video> for the pair.',
  fields,
  attributes,
  locals: mediaLocals,
  prototype: true,
});

export default VideoPlayer;
