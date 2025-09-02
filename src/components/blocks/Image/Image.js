// src/components/blocks/Image/Image.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _Image from './_Image';

// Custom parser to resolve relative image paths during content loading
//
// This could move to render time, but we'd eventually like more
// checks during loading (e.g. does image exist) for better error
// handling earlier in the process.
function imageParser({ id, tag, attributes, provenance, rawParsed, storeEntry, provider }) {
  const { src, ...otherAttributes } = attributes;

  let resolvedSrc = src;

  // Resolve relative paths using storage provider during parsing
  if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//') && !src.startsWith('/')) {
    // This is a relative path - resolve it using storage provider
    if (provenance && provenance.length > 0 && provider?.resolveRelativePath) {
      const currentProvenance = provenance[provenance.length - 1];
      resolvedSrc = provider.resolveRelativePath(currentProvenance, src);
    }
  }

  const entry = {
    id,
    tag,
    attributes: { ...otherAttributes, src: resolvedSrc },
    provenance,
    rawParsed,
    kids: []
  };

  storeEntry(id, entry);
  return id;
}

const Image = core({
  parser: imageParser,
  staticKids: () => [],
  name: 'Image',
  description: 'Displays images from content directory or external URLs',
  component: _Image,
});

export default Image;
