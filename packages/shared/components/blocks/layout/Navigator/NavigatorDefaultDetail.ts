// src/components/blocks/layout/Navigator/NavigatorDefaultDetail.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorDefaultDetail from './_NavigatorDefaultDetail';

const NavigatorDefaultDetail = dev({
  ...parsers.text(),
  name: 'NavigatorDefaultDetail',
  description: 'Default detail component for Navigator',
  component: _NavigatorDefaultDetail,
  requiresUniqueId: false,
  // Navigator injects per-item data fields as attributes at render time.
  acceptsUnknownAttributes: true,
});

export default NavigatorDefaultDetail;
