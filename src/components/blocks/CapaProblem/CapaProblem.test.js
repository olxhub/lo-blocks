// src/components/blocks/CapaProblem/CapaProblem.test.js
import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store as loStore } from '@/lib/state/store';
import RenderOLX from '@/components/common/RenderOLX';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/storage/providers/file';

it('wires inputs and graders with explicit targeting', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('src/components/blocks/CapaProblem'));
  const root = idMap['CapaProblemTargeting'];
  expect(root).toBeDefined();

  // RatioGrader with explicit target="num,den"
  const graderId = 'CapaProblemTargeting_grader_0';
  expect(idMap[graderId]).toBeDefined();
  expect(idMap['num']).toBeDefined();
  expect(idMap['den']).toBeDefined();

  // Grader should have target wired to the two inputs
  expect(idMap[graderId].attributes.target).toBe('num,den');

  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_button');
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_correctness');
});

it('renders ActionButton and Correctness at runtime', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('src/components/blocks/CapaProblem'));
  expect(idMap['CapaProblemDemo']).toBeDefined();

  const store = loStore.init();
  const { container } = rtlRender(
    React.createElement(Provider, { store },
      React.createElement(RenderOLX, { id: 'CapaProblemDemo', baseIdMap: idMap })
    )
  );

  const btn = container.querySelector('[data-block-type="ActionButton"]');
  const status = container.querySelector('[data-block-type="Correctness"]');
  expect(btn).toBeTruthy();
  expect(status).toBeTruthy();
});
