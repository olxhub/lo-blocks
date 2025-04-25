/*
  SideBarPanel Block (Dev)

  Layout component with named slots:
  - <MainPane>   → kids.main
  - <Sidebar>    → kids.sidebar (array)

  This version uses a structured parser to map <MainPane> and <Sidebar>
  into an object like: { main: xblock, sidebar: [xblock, ...] }

  Note: children are not rendered automatically — the parent system is expected
  to call `render({ node, idMap })` on each slot.
*/

import { dev } from '../blocks.js';
import { childParser } from '@/lib/olx/parsers';
import _SideBarPanel from './SideBarPanelClient';

// === Custom parser to build named slots ===
const sbParser = childParser(function sideBlockParser({ rawChildren, parse }) {
  let main = null;
  const sidebar = [];

  rawChildren.forEach(child => {
    const tag = Object.keys(child).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return;

    const block = child[tag];

    if (tag === 'MainPane') {
      main = parse(block);
    } else if (tag === 'Sidebar') {
      const items = Array.isArray(block) ? block : [block];
      items.forEach(n => sidebar.push(parse(n)));
    } else {
      console.warn(`[SideBarPanel] Unknown tag: <${tag}>`);
    }
  });

  return { main, sidebar };
});

const SideBarPanel = dev({
  name: 'SideBarPanel',
  component: _SideBarPanel,
  parser: sbParser
});

export default SideBarPanel;
