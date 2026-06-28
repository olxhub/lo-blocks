// Catalog block — author catalog listing repositories and their launchables.
//
// Usage:
//   <Catalog />
//
// This block wraps the existing CatalogView component, making the catalog
// available through the standard block pipeline. The /catalog route serves
// this block via RenderOLX.

import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Catalog from './_Catalog';

const Catalog = dev({
  ...parsers.ignore(),
  name: 'Catalog',
  description: 'Author catalog — lists repositories and their launchables.',
  component: _Catalog,
});

export default Catalog;
