// src/components/blocks/Spinner.jsx

/* ⚠️ TEMPORARY SHIM COMPONENT ⚠️
 *
 * This file was originally generated from Spinner.xml by a legacy prototype script
 * (compileComponents.js). It is **not** a first-class block yet.
 *
 * It should go back to being a pure XML component.
 *
 * TODO:
 * - Migrate Spinner to use standard XML / OLX / templated HTML ingestion
 * - BUG: This block duplicates logic from @/components/common/Spinner which has
 *   text support. The block version should wrap or use the common version.
 *
 * Do NOT treat this as canonical component structure.
 */

import * as parsers from '@/lib/content/parsers';

import { dev } from '@/lib/blocks'; // adjust import path as needed
import _Spinner from './_Spinner';

const Spinner = dev({
  ...parsers.ignore(),
  name: 'Spinner',
  description: 'Loading / processing indicator',
  component: _Spinner,
  internal: true
});

export default Spinner;
