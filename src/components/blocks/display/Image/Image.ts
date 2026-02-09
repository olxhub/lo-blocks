// src/components/blocks/Image/Image.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Image from './_Image';

const Image = core({
  ...parsers.assetSrc(),
  name: 'Image',
  description: 'Displays images from content directory or external URLs',
  component: _Image,
  attributes: baseAttributes.extend({
    src: z.string({ required_error: 'src is required' }).describe('Image source path (relative, content-absolute, platform //, or external URL)'),
    alt: z.string().optional().describe('Alternative text for accessibility'),
    width: z.string().optional().describe('Image width in pixels (not available in some contexts)'), // TODO: Figure out why this didn't work...
    height: z.string().optional().describe('Image height in pixels (not available in some contexts)'),
  }),
});

export default Image;
