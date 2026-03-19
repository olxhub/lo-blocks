// src/components/blocks/layout/Navigator/NavigatorTeamDetail.js

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _NavigatorTeamDetail from './_NavigatorTeamDetail';

const NavigatorTeamDetail = dev({
  ...parsers.text(),
  name: 'NavigatorTeamDetail',
  description: 'Team member detail component for Navigator',
  component: _NavigatorTeamDetail,
  requiresUniqueId: false
});

export default NavigatorTeamDetail;
