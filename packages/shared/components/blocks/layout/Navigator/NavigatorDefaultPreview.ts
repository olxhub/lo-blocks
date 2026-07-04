// packages/shared/components/blocks/layout/Navigator/NavigatorDefaultPreview.ts

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const NavigatorDefaultPreview = dev({
  ...parsers.text(),
  name: 'NavigatorDefaultPreview',
  description: 'Default preview component for Navigator',
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorDefaultPreview;
