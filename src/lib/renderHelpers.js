// src/lib/renderHelpers.js
// Small helper to render a virtual block without exposing OLX node shape
// Usage: renderBlock(props, 'Correctness', { id: 'x_status', target: '...' })
//
// TODO: Eventually, renderBlock, render, and renderCompiledChildren
// needs to be rationalized. They grew up a bit organically, and a lot
// of the code needs a reorg / refactor...

import { render as renderNode } from '@/lib/render';

export function renderBlock(props, tag, options = {}, kids = []) {
  const { id, ...attributes } = options || {};
  const node = { id, tag, attributes, kids };
  return renderNode({ ...props, node });
}

