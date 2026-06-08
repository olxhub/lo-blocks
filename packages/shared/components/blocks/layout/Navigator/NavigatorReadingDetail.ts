// packages/shared/components/blocks/layout/Navigator/NavigatorReadingDetail.ts

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorReadingDetail from './_NavigatorReadingDetail';

const NavigatorReadingDetail = dev({
  ...parsers.text(),
  name: 'NavigatorReadingDetail',
  description: 'Reading detail component that renders referenced blocks',
  component: _NavigatorReadingDetail,
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorReadingDetail;
