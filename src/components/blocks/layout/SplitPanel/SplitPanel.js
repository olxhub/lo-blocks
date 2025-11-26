// src/components/blocks/SplitPanel/SplitPanel.jsx
import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import _SplitPanel from './_SplitPanel';

const splitParser = childParser(async function splitPanelParser({ rawKids, parseNode }) {
  let left = null;
  let right = null;

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
    } else {
      console.warn(`[SplitPanel] Unknown tag: <${tag}>`);
    }
  }

  return { left, right };
});

splitParser.staticKids = entry => [
  ...(Array.isArray(entry.kids.left) ? entry.kids.left : []),
  ...(Array.isArray(entry.kids.right) ? entry.kids.right : [])
].filter(k => k && k.id).map(k => k.id);

const SplitPanel = dev({
  ...splitParser(),
  name: 'SplitPanel',
  description: 'Two-column layout with separate LeftPane and RightPane sections',
  component: _SplitPanel
});

export default SplitPanel;
