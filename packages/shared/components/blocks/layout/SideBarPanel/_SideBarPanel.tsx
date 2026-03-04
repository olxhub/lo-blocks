// src/components/blocks/SideBarPanel/_SideBarPanel.jsx
'use client';

import React from 'react';
import { useKids } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

function MainContent({ props, main }) {
  const { kids } = useKids({ ...props, kids: main });
  return <>{kids}</>;
}

function SidebarItem({ props, node }) {
  const { kids } = useKids({ ...props, kids: [node] });
  return <>{kids}</>;
}

function _SideBarPanel( props ) {
  const { kids = {}, idMap, parents } = props;
  if (!kids || typeof kids !== 'object') {
    return (
      <DisplayError
        props = { props }
        name="SideBarPanel"
        message="This part of the page didn't receive any content to show. Please check if the lesson structure includes both a MainPane and a Sidebar."
        technical="Expected 'kids' prop to be an object"
        data={{ kids }}
      />
    );
  }

  const { main, sidebar } = kids;

  if (!Array.isArray(main)) {
    return (
      <DisplayError
        props = { props }
        name="SideBarPanel"
        message="This section of the lesson expects multiple content blocks (like text or buttons), but something went wrong. Please check if the structure inside <MainPane> is correct."
        technical="Expected 'kids.main' to be an array"
        data={{ main }}
      />
    );
  }

  if (!Array.isArray(sidebar)) {
    return (
      <DisplayError
        props = { props }
        name="SideBarPanel"
        message="The sidebar is expecting a list of items (like buttons or prompts), but couldn't find them. Make sure the <Sidebar> has content inside."
        technical="Expected 'kids.sidebar' to be an array"
        data={{ sidebar }}
      />
    );
  }

  return (
    <div className="sidebarpanel-container">
      <div key="MainPane" className="main-pane">
        <MainContent props={props} main={main} />
      </div>
      <div key="Sidebar" className="sidebar">
        {sidebar.map((node, i) => (
          <div key={i} className="sidebar-item">
            <SidebarItem props={props} node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default _SideBarPanel;
