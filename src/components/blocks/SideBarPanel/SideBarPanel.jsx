// src/components/blocks/SideBarPanel/SideBarPanel.jsx
/*
  SideBarPanel Block (Dev)

  Layout component with named slots:
  - <MainPane>   → kids.main
  - <Sidebar>    → kids.sidebar (array)

  This version uses a structured parser to map <MainPane> and <Sidebar>
  into an object like: { main: block, sidebar: [block, ...] }
*/

import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/content/parsers';
import _SideBarPanel from './_SideBarPanel';

// === Custom parser to build named slots ===
const sbParser = childParser(async function sideBlockParser({ rawKids, parseNode }) {
  let main = null;
  const sidebar = [];

  for (const child of rawKids) {
    const tag = Object.keys(child).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) continue;

    const block = child[tag];

    if (tag === 'MainPane') {
      // MainPane -> unwrap children and parse
      const mainPaneChildren = Array.isArray(block) ? block : [block];
      main = (await Promise.all(mainPaneChildren.map(c => parseNode(c))))
        .filter(Boolean); // parse each kid
    } else if (tag === 'Sidebar') {
      const sidebarChildren = Array.isArray(block) ? block : [block];
      for (const n of sidebarChildren) {
        const inner = Array.isArray(n) ? n : [n];
        for (const c of inner) {
          const parsed = await parseNode(c);
          if (parsed) sidebar.push(parsed);
        }
      }
    } else {
      console.warn(`[SideBarPanel] Unknown tag: <${tag}>`);
    }
  }

  return { main, sidebar };
});
sbParser.staticKids = entry => [
  ...(Array.isArray(entry.kids.main) ? entry.kids.main : []),
  ...(Array.isArray(entry.kids.sidebar) ? entry.kids.sidebar : [])
].filter(k => k && k.id).map(k => k.id);


const SideBarPanel = dev({
  ...sbParser(),
  name: 'SideBarPanel',
  description: 'Layout with separate MainPane and Sidebar sections for content organization',
  component: _SideBarPanel
});

export default SideBarPanel;
