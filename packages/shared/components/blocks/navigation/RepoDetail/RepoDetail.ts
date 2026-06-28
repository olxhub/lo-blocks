// RepoDetail block — full repository view with all activities.
//
// Usage:
//   <RepoDetail origin="https://github.com/olxhub/edu.memphis.psych.git" />
//
// Served at /repo/:encodedOrigin. Shows the complete repo: header, all
// activities with descriptions and actions, building blocks section.
// The compact catalog card links here for repos with many activities.

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _RepoDetail from './_RepoDetail';

const RepoDetail = dev({
  ...parsers.ignore(),
  name: 'RepoDetail',
  description: 'Full repository view — all activities, descriptions, and actions.',
  component: _RepoDetail,
  attributes: z.object({
    origin: z.string().describe('Repository origin (git URL or path) to display'),
  }).strict(),
});

export default RepoDetail;
