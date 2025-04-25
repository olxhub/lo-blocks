'use client';

import React from 'react';
import { render } from '@/lib/render';

function _SideBarPanel({ kids = {}, idMap }) {
  const { main, sidebar = [] } = kids;

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1">
        <h1>Main</h1>
        {main ? render({ node: main, idMap }) : null}
      </div>
      <div className="w-full md:w-64 space-y-3">
        <h1>Sidebar</h1>
        {sidebar.map((node, i) => (
          <div key={i} className="bg-white rounded shadow-sm border p-3 text-sm">
            {render({ node, idMap })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default _SideBarPanel;
