// src/components/blocks/CapaProblem/CapaProblem.test.js
import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store as loStore } from '@/lib/state/store';
import { render, makeRootNode } from '@/lib/render';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/storage';

it('wires inputs and graders; UI controls rendered at runtime', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('content/demos'));
  const root = idMap['CapaDemo'];
  expect(root).toBeDefined();

  const graderId = 'CapaDemoRatio_grader_0';
  const inputId0 = 'CapaDemoRatio_input_0';
  const inputId1 = 'CapaDemoRatio_input_1';

  expect(idMap[graderId]).toBeDefined();
  expect(idMap[inputId0]).toBeDefined();
  expect(idMap[inputId1]).toBeDefined();
  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain('CapaDemoRatio_button');
  expect(Object.keys(idMap)).not.toContain('CapaDemoRatio_correctness');

  const grader = idMap[graderId];
  const hasP = grader.kids.some(k => k.type === 'html' && k.tag === 'p');
  expect(hasP).toBe(true);

  expect(idMap[graderId].attributes.target).toBe(
    `${inputId0},${inputId1}`
  );
});

it('renders ActionButton and Correctness at runtime', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('content/demos'));
  const node = idMap['CapaDemo'];
  const ui = render({ node, idMap, nodeInfo: makeRootNode() });
  const store = loStore.init();
  const { container } = rtlRender(
    React.createElement(Provider, { store }, ui)
  );
  // Uses data-block-type from render wrapper
  const btn = container.querySelector('[data-block-type="ActionButton"]');
  const status = container.querySelector('[data-block-type="Correctness"]');
  expect(btn).toBeTruthy();
  expect(status).toBeTruthy();
});
