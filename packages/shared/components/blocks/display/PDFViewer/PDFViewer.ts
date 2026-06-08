// packages/shared/components/blocks/display/PDFViewer/PDFViewer.ts
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _PDFViewer from './_PDFViewer';

const PDFViewer = core({
  ...parsers.assetSrc(),
  name: 'PDFViewer',
  description: 'Displays PDF documents from content directory or external URLs',
  component: _PDFViewer,
  attributes: z.object({
    src: z.string({ required_error: 'src is required' }).describe('PDF source path (relative, content-absolute, platform //, or external URL)'),
    width: z.string().optional().describe('Viewer width (CSS value, e.g. "100%" or "800px")'),
    height: z.string().optional().describe('Viewer height (CSS value, e.g. "600px")'),
  }).strict(),
});

export default PDFViewer;
