// packages/shared/components/blocks/layout/Navigator/NavigatorTeamPreview.ts

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const NavigatorTeamPreview = dev({
  ...parsers.ignore(),
  name: 'NavigatorTeamPreview',
  description: 'Team member preview component for Navigator',
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorTeamPreview;
