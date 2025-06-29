// src/lib/render.test.js
import { __testables } from './render.jsx';
import { parseOLX } from './content/parseOLX';
import { render, makeRootNode } from './render.jsx';
import { COMPONENT_MAP } from '../components/componentMap';
import { Provider } from 'react-redux';
import React from 'react';
import { store } from './state/store';
import { render as rtlRender, screen } from '@testing-library/react';

const { assignReactKeys } = __testables;

describe('assignReactKeys', () => {
  it('assigns keys correctly and passes through primitives', () => {
    const input = [
      { id: "foo", data: 1 },
      { id: "bar", data: 2 },
      { id: "foo", data: 3 },
      { id: "baz", data: 4 },
      { id: "foo", data: 5 },
      { data: 6 }, // No id
      null,        // Primitive
      "string",    // Primitive
    ];

    const expected = [
      { id: "foo", data: 1, key: "foo" },
      { id: "bar", data: 2, key: "bar" },
      { id: "foo", data: 3, key: "foo.1" },
      { id: "baz", data: 4, key: "baz" },
      { id: "foo", data: 5, key: "foo.2" },
      { data: 6, key: "__idx__5" },
      null,
      "string",
    ];

    const result = assignReactKeys(input);
    expect(result).toStrictEqual(expected);
  });

  it('throws an error if a child already has a key property', () => {
    const input = [{ id: 'foo', key: 'already-set', data: 1 }];
    expect(() => assignReactKeys(input)).toThrow(/already has a 'key' property/);
  });
});

describe('render with <Use> overrides', () => {
  it('applies attribute overrides when rendering', async () => {
    const xml = '<Lesson id="L"><ActionButton id="B" label="One"/><Use ref="B" label="Two"/></Lesson>';
    const { idMap, root } = await parseOLX(xml, ['file://test.xml']);
    const reduxStore = store.init();
    const element = render({ node: root, idMap, nodeInfo: makeRootNode(), componentMap: COMPONENT_MAP });
    rtlRender(React.createElement(Provider, { store: reduxStore }, element));
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('One');
    expect(buttons[1].textContent).toBe('Two');
  });
});
