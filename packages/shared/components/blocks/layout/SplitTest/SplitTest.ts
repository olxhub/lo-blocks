// packages/shared/components/blocks/layout/SplitTest/SplitTest.ts
//
// SplitTest block - content experiments / A/B testing.
//
// OPEN EDX COMPATIBILITY. This supports the Open edX content experiment model.
// It is not intended as the primary mechanism for RCTs in Learning Observer.
//
// Each child is a group. Students are assigned to one group and see only that
// child. Group assignment persists in Redux (and eventually server-side).
//
// Usage:
//   <SplitTest id="modality_exp">
//     <Markdown>Text version</Markdown>
//     <Video src="video_version.mp4" />
//     <Audio src="audio_version.mp3" />
//   </SplitTest>
//
//   <!-- Reuse the same group assignment elsewhere -->
//   <SplitTest id="modality_quiz" target="modality_exp">
//     <Markdown>Quiz for text group</Markdown>
//     <Markdown>Quiz for video group</Markdown>
//     <Markdown>Quiz for audio group</Markdown>
//   </SplitTest>
//
// Attributes:
//   target  - ID of master SplitTest whose group assignment to follow
//   groups  - Comma-separated group names for analytics (e.g. "inquiry,traditional")
//   weights - Comma-separated assignment weights, normalized to 1 (e.g. "0.5,0.25,0.25")
//
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';

export const fields = state.fields([state.commonFields.value]);

const SplitTest = dev({
  ...parsers.blocks(),
  name: 'SplitTest',
  description: 'Content experiments / A/B testing (Open edX compatibility)',
  fields,
  internal: true,
  attributes: z.object({
    target: z_stateRef.optional()
      .describe('ID of master SplitTest whose group assignment to follow'),
    groups: z.string().optional()
      .describe('Comma-separated group names for analytics (e.g. "inquiry,traditional")'),
    weights: z.string().optional()
      .describe('Comma-separated assignment weights, normalized to 1 (e.g. "0.5,0.25,0.25")'),
  }).strict(),
});

export default SplitTest;
