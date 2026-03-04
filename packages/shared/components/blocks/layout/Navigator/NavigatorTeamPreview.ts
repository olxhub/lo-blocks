// src/components/blocks/layout/Navigator/NavigatorTeamPreview.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorTeamPreview from './_NavigatorTeamPreview';

const NavigatorTeamPreview = dev({
  ...parsers.text(),
  name: 'NavigatorTeamPreview',
  description: 'Team member preview component for Navigator',
  component: _NavigatorTeamPreview,
  requiresUniqueId: false
});

export default NavigatorTeamPreview;
