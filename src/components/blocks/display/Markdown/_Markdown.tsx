import React from 'react';
import RenderMarkdown, { markdownComponents } from '@/components/common/RenderMarkdown';

// Re-export for backwards compatibility
export { markdownComponents };

export function _Markdown(props) {
  const { kids } = props;

  /*** HACK HACK HACK ***/
  // This works around a bug where CapaProblem doesn't use block parsers correctly
  let content = kids;
  if (Array.isArray(kids) && kids.length > 0) {
    // If kids contains objects with type 'text', extract the text content
    content = kids.map((kid) => {
      if (typeof kid === 'object' && kid.type === 'text') {
        return kid.text;
      }
      return typeof kid === 'string' ? kid : '';
    }).join('');
  }
  /*** end of hack ***/

  return <RenderMarkdown>{content}</RenderMarkdown>;
}
