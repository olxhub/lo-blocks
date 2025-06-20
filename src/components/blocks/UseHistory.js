// src/components/blocks/UseHistory.js
import React from 'react';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { _UseHistory } from './_UseHistory';
import { ignore } from '@/lib/content/parsers';

export const fields = state.fields([
  'value',
  'history',
  'index',
  { name: 'showHistory', scope: 'componentSetting' },
  { name: 'follow', scope: 'componentSetting' }
]);

const UseHistory = dev({
  ...ignore,
  name: 'UseHistory',
  component: _UseHistory,
  namespace: 'org.mitros.dev',
  description: 'Like UseDynamic with history navigation.',
  fields
});

export default UseHistory;
