// packages/shared/components/blocks/layout/Navigator/NavigatorDefaultDetail.ts

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const NavigatorDefaultDetail = dev({
  ...parsers.text(),
  name: 'NavigatorDefaultDetail',
  description: 'Default detail component for Navigator',
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorDefaultDetail;
