
/* ⚠️ TEMPORARY SHIM COMPONENT ⚠️
 *
 * This file was originally generated from Spinner.xml by a legacy prototype script
 * (compileComponents.js). It is **not** a first-class block yet.
 *
 * It should go back to being a pure XML component.
 *
 * TODO:
 * - Migrate Spinner to use standard XML / OLX / templated HTML ingestion
 * - Remove manual registration in COMPONENT_MAP if applicable
 *
 * Do NOT treat this as canonical component structure.
 */

import React from 'react';

import * as parsers from '@/lib/olx/parsers';

if (typeof window !== 'undefined') {
  import('./Spinner.css');
}

import { dev } from '@/lib/blocks'; // adjust import path as needed

function _Spinner() {
  return (
    <div className="spinner">
      <div></div>
      <div></div>
      <div></div>
    </div>
  );
}

const Spinner = dev({
  ...parsers.ignore,
  name: 'Spinner',
  component: _Spinner
});

export default Spinner;
