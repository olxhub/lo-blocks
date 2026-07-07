// packages/shared/components/blocks/media/Video/Video.ts
//
// The composed experience: VideoPlayer + Transcript sharing ONE media
// bucket (this block's), with a show/hide control for the transcript.
// Authors who want the pieces separately (transcript in a sidebar,
// multiple transcripts, a scrubber elsewhere) use <VideoPlayer> and
// <Transcript target=…/> directly; this block is the common case.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { mediaFields, mediaLocals } from '../mediaSync';

// mediaFields.extend: Fields objects merge via extend() (fields.ts) —
// a Fields is not itself a FieldDecl.
export const fields = mediaFields.extend(state.fields([
  // Transcript visibility — per-user, replayable like everything else.
  'showTranscript',
]));

const attributes = z.object({
  src: z.string().describe('Video URL (e.g. /content/lecture.mp4)'),
  poster: z.string().optional().describe('Image shown before playback starts'),
  transcript: z.string().optional()
    .describe('WebVTT transcript URL — adds the synchronized transcript panel'),
});

const Video = core({
  ...parsers.ignore(),
  name: 'Video',
  description: 'Video with synchronized, toggleable transcript — VideoPlayer + Transcript composed.',
  fields,
  attributes,
  locals: mediaLocals,
});

export default Video;
