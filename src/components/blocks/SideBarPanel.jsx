'use client';

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

import React from 'react';
import { dev } from '../blocks.js';
import { childParser } from '@/lib/olx/parsers';
import { render } from '@/lib/render';

function _SideBarPanel({ kids = {}, idMap }) {
  const { main, sidebar = [] } = kids;

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1">
        <h1> Main </h1>
        {main ? render({ node: main, idMap }) : null}
      </div>
      <div className="w-full md:w-64 space-y-3">
        <h1> Sidebar </h1>
        {sidebar.map((node, i) => (
          <div key={i} className="bg-white rounded shadow-sm border p-3 text-sm">
            {render({ node, idMap })}
          </div>
        ))}
      </div>
    </div>
  );
}

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
