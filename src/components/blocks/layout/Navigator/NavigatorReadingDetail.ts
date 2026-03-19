// src/components/blocks/layout/Navigator/NavigatorReadingDetail.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorReadingDetail from './_NavigatorReadingDetail';

const NavigatorReadingDetail = dev({
  ...parsers.text(),
  name: 'NavigatorReadingDetail',
  description: 'Reading detail component that renders referenced blocks',
  component: _NavigatorReadingDetail,
  requiresUniqueId: false
});

export default NavigatorReadingDetail;
