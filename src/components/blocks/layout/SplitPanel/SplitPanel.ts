// src/components/blocks/SplitPanel/SplitPanel.jsx
import { z } from 'zod';
import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _SplitPanel from './_SplitPanel';

const splitParser = childParser(async function splitPanelParser({ rawKids, parseNode }) {
  let left: any = null;
  let right: any = null;
  let start: any = null;
  let end: any = null;

  for (const child of rawKids) {
    const tag = Object.keys(child).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) continue;
    const block = child[tag];

    if (tag === 'LeftPane') {
      const leftChildren = Array.isArray(block) ? block : [block];
      left = (await Promise.all(leftChildren.map(c => parseNode(c)))).filter(Boolean);
    } else if (tag === 'RightPane') {
      const rightChildren = Array.isArray(block) ? block : [block];
      right = (await Promise.all(rightChildren.map(c => parseNode(c)))).filter(Boolean);
    } else if (tag === 'StartPane') {
      const startChildren = Array.isArray(block) ? block : [block];
      start = (await Promise.all(startChildren.map(c => parseNode(c)))).filter(Boolean);
    } else if (tag === 'EndPane') {
      const endChildren = Array.isArray(block) ? block : [block];
      end = (await Promise.all(endChildren.map(c => parseNode(c)))).filter(Boolean);
    } else {
      console.warn(`[SplitPanel] Unknown tag: <${tag}>`);
    }
  }

  return { left, right, start, end };
});

splitParser.staticKids = entry => [
  ...(Array.isArray(entry.kids.left) ? entry.kids.left : []),
  ...(Array.isArray(entry.kids.right) ? entry.kids.right : []),
  ...(Array.isArray(entry.kids.start) ? entry.kids.start : []),
  ...(Array.isArray(entry.kids.end) ? entry.kids.end : [])
].filter(k => k && k.id).map(k => k.id);

const SplitPanel = dev({
  ...splitParser(),
  name: 'SplitPanel',
  description: 'Two-column layout with separate LeftPane and RightPane sections',
  component: _SplitPanel,
  attributes: baseAttributes.extend({
    sizes: z.string().optional().describe('Comma-separated percentage sizes (e.g., "30,70" default: "50,50")'),
  }),
});

export default SplitPanel;
