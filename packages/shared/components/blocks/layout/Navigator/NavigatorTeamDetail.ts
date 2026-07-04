// packages/shared/components/blocks/layout/Navigator/NavigatorTeamDetail.ts

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const NavigatorTeamDetail = dev({
  ...parsers.text(),
  name: 'NavigatorTeamDetail',
  description: 'Team member detail component for Navigator',
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorTeamDetail;
