// src/components/blocks/layout/Navigator/NavigatorDefaultPreview.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorDefaultPreview from './_NavigatorDefaultPreview';

const NavigatorDefaultPreview = dev({
  ...parsers.text(),
  name: 'NavigatorDefaultPreview',
  description: 'Default preview component for Navigator',
  component: _NavigatorDefaultPreview,
  requiresUniqueId: false
});

export default NavigatorDefaultPreview;
